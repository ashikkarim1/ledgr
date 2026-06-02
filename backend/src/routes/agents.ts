import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authenticateToken } from '../middleware/auth';
import { validateAgentInput, validateAssignmentInput } from '../validation/agent-validation';
import { agentService } from '../services/agentService';
import { broadcastAgentStatusUpdate } from '../websocket/agentStatusBroadcaster';

const router = Router();

// Middleware to extract org_id from JWT
router.use(authenticateToken);

// ============ AGENT MANAGEMENT ENDPOINTS ============

/**
 * POST /api/agents
 * Create a new agent
 * Body: { name, email, phone, role, specialization[], max_concurrent_tasks }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const org_id = (req as any).org_id;
    const validation = validateAgentInput(req.body);
    
    if (!validation.valid) {
      return res.status(400).json({ errors: validation.errors });
    }

    const agent = await agentService.createAgent(org_id, {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      role: req.body.role,
      specialization: req.body.specialization || [],
      max_concurrent_tasks: req.body.max_concurrent_tasks || 5,
    });

    res.status(201).json({ agent });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create agent', details: (error as Error).message });
  }
});

/**
 * GET /api/agents
 * List all agents for the organization with current status and utilization
 * Query params: ?role=tax&status=online&includePerformance=true
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const org_id = (req as any).org_id;
    const { role, status, includePerformance } = req.query;

    const agents = await agentService.listAgents(org_id, {
      role: role as string,
      status: status as string,
      includePerformance: includePerformance === 'true',
    });

    res.json({ agents, count: agents.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list agents', details: (error as Error).message });
  }
});

/**
 * GET /api/agents/:id
 * Get agent detail with performance metrics
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const org_id = (req as any).org_id;
    const { id } = req.params;

    const agent = await agentService.getAgentDetail(org_id, id);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ agent });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch agent', details: (error as Error).message });
  }
});

/**
 * PATCH /api/agents/:id/status
 * Update agent status (online/offline/busy/away)
 * Body: { status, availability_note? }
 */
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const org_id = (req as any).org_id;
    const { id } = req.params;
    const { status, availability_note } = req.body;

    if (!['online', 'offline', 'busy', 'away'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const agent = await agentService.updateAgentStatus(org_id, id, status, availability_note);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Broadcast status update to all connected WebSocket clients
    broadcastAgentStatusUpdate(org_id, agent);

    res.json({ agent });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update agent status', details: (error as Error).message });
  }
});

/**
 * GET /api/agents/availability/filter
 * Get available agents filtered by specialization/skill
 * Query params: ?specialization=tax&exclude_busy=true
 */
router.get('/availability/filter', async (req: Request, res: Response) => {
  try {
    const org_id = (req as any).org_id;
    const { specialization, exclude_busy } = req.query;

    const available = await agentService.getAvailableAgents(org_id, {
      specialization: specialization as string,
      excludeBusy: exclude_busy === 'true',
    });

    res.json({ available, count: available.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch available agents', details: (error as Error).message });
  }
});

/**
 * PATCH /api/agents/:id
 * Update agent profile (name, email, phone, role, specialization, max_concurrent_tasks)
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const org_id = (req as any).org_id;
    const { id } = req.params;

    const agent = await agentService.updateAgent(org_id, id, req.body);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ agent });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update agent', details: (error as Error).message });
  }
});

// ============ TASK ASSIGNMENT ENDPOINTS ============

/**
 * POST /api/agents/:id/assignments
 * Assign a task to an agent
 * Body: { entity_type, entity_id, priority, description }
 */
router.post('/:id/assignments', async (req: Request, res: Response) => {
  try {
    const org_id = (req as any).org_id;
    const { id } = req.params;
    const validation = validateAssignmentInput(req.body);

    if (!validation.valid) {
      return res.status(400).json({ errors: validation.errors });
    }

    const assignment = await agentService.createAssignment(org_id, id, {
      entity_type: req.body.entity_type,
      entity_id: req.body.entity_id,
      priority: req.body.priority,
      description: req.body.description,
    });

    res.status(201).json({ assignment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create assignment', details: (error as Error).message });
  }
});

/**
 * GET /api/agents/:id/assignments
 * List assignments for an agent
 * Query params: ?status=in_progress&priority=1-5
 */
router.get('/:id/assignments', async (req: Request, res: Response) => {
  try {
    const org_id = (req as any).org_id;
    const { id } = req.params;
    const { status, priority } = req.query;

    const assignments = await agentService.listAssignments(org_id, id, {
      status: status as string,
      priority: priority as string,
    });

    res.json({ assignments, count: assignments.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list assignments', details: (error as Error).message });
  }
});

/**
 * PATCH /api/agents/assignments/:assignmentId
 * Update assignment status (assigned/in_progress/completed/escalated)
 * Body: { status, resolution_time?, notes? }
 */
router.patch('/assignments/:assignmentId', async (req: Request, res: Response) => {
  try {
    const org_id = (req as any).org_id;
    const { assignmentId } = req.params;

    const assignment = await agentService.updateAssignmentStatus(org_id, assignmentId, req.body);
    
    if (!assignment) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json({ assignment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update assignment', details: (error as Error).message });
  }
});

// ============ PERFORMANCE METRICS ENDPOINTS ============

/**
 * GET /api/agents/:id/performance
 * Get performance metrics for an agent
 */
router.get('/:id/performance', async (req: Request, res: Response) => {
  try {
    const org_id = (req as any).org_id;
    const { id } = req.params;

    const performance = await agentService.getPerformanceMetrics(org_id, id);
    
    if (!performance) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ performance });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch performance metrics', details: (error as Error).message });
  }
});

/**
 * GET /api/agents/performance/team
 * Get team-wide performance summary
 */
router.get('/performance/team', async (req: Request, res: Response) => {
  try {
    const org_id = (req as any).org_id;

    const teamPerformance = await agentService.getTeamPerformance(org_id);

    res.json({ teamPerformance });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch team performance', details: (error as Error).message });
  }
});

// ============ TASK ROUTING ENDPOINTS ============

/**
 * POST /api/agents/route-task
 * Intelligent task routing based on specialization, utilization, and performance
 * Body: { entity_type, entity_id, required_specialization, priority }
 */
router.post('/route-task', async (req: Request, res: Response) => {
  try {
    const org_id = (req as any).org_id;

    const assignment = await agentService.routeTaskIntelligently(org_id, {
      entity_type: req.body.entity_type,
      entity_id: req.body.entity_id,
      required_specialization: req.body.required_specialization,
      priority: req.body.priority || 3,
    });

    if (!assignment) {
      return res.status(503).json({ 
        error: 'No available agents to handle this task. All agents are at capacity.',
        retry_after: 300 // Suggest retry in 5 minutes
      });
    }

    res.status(201).json({ assignment });
  } catch (error) {
    res.status(500).json({ error: 'Failed to route task', details: (error as Error).message });
  }
});

export default router;
