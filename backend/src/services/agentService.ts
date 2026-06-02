import { db } from '../db';
import { cache } from '../cache/redis';

interface CreateAgentInput {
  name: string;
  email: string;
  phone: string;
  role: 'tax' | 'ap' | 'ar' | 'reconciliation' | 'reporting' | 'supervisor';
  specialization: string[];
  max_concurrent_tasks: number;
}

interface CreateAssignmentInput {
  entity_type: string;
  entity_id: string;
  priority: number;
  description: string;
}

interface ListOptions {
  role?: string;
  status?: string;
  includePerformance?: boolean;
}

interface AvailabilityFilter {
  specialization?: string;
  excludeBusy?: boolean;
}

interface RouteTaskInput {
  entity_type: string;
  entity_id: string;
  required_specialization?: string;
  priority: number;
}

export const agentService = {
  /**
   * Create a new agent with status=online, utilization=0%, performance_score=100
   */
  async createAgent(org_id: string, input: CreateAgentInput) {
    const result = await db.query(
      `INSERT INTO agents 
       (org_id, name, email, phone, role, specialization, current_status, 
        utilization_percent, max_concurrent_tasks, performance_score)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        org_id,
        input.name,
        input.email,
        input.phone,
        input.role,
        JSON.stringify(input.specialization),
        'online',
        0,
        input.max_concurrent_tasks,
        100,
      ]
    );
    
    // Invalidate cache
    await cache.del(`agents:${org_id}`);
    
    return result.rows[0];
  },

  /**
   * List all agents for organization with optional filters
   */
  async listAgents(org_id: string, options: ListOptions) {
    let query = `
      SELECT a.*, 
        (SELECT COUNT(*) FROM agent_assignments 
         WHERE agent_id = a.id AND status IN ('assigned', 'in_progress')) as active_task_count
      FROM agents a
      WHERE a.org_id = $1 AND a.is_active = true
    `;
    
    const params: any[] = [org_id];
    
    if (options.role) {
      query += ` AND a.role = $${params.length + 1}`;
      params.push(options.role);
    }
    
    if (options.status) {
      query += ` AND a.current_status = $${params.length + 1}`;
      params.push(options.status);
    }
    
    query += ` ORDER BY a.performance_score DESC, a.utilization_percent ASC`;
    
    const result = await db.query(query, params);
    
    // If includePerformance, augment with monthly metrics
    if (options.includePerformance) {
      const agents = result.rows;
      for (const agent of agents) {
        const perfResult = await db.query(
          `SELECT * FROM agent_performance 
           WHERE agent_id = $1 AND month_year >= date_trunc('month', NOW() - interval '3 months')
           ORDER BY month_year DESC LIMIT 3`,
          [agent.id]
        );
        agent.performance_history = perfResult.rows;
      }
      return agents;
    }
    
    return result.rows;
  },

  /**
   * Get detailed agent info with current assignments and performance
   */
  async getAgentDetail(org_id: string, agent_id: string) {
    const result = await db.query(
      `SELECT a.*,
        (SELECT COUNT(*) FROM agent_assignments 
         WHERE agent_id = a.id AND status IN ('assigned', 'in_progress')) as active_task_count
       FROM agents a
       WHERE a.org_id = $1 AND a.id = $2`,
      [org_id, agent_id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const agent = result.rows[0];
    
    // Get recent assignments
    const assignmentsResult = await db.query(
      `SELECT * FROM agent_assignments 
       WHERE agent_id = $1 
       ORDER BY created_at DESC LIMIT 10`,
      [agent_id]
    );
    agent.recent_assignments = assignmentsResult.rows;
    
    // Get performance metrics
    const perfResult = await db.query(
      `SELECT * FROM agent_performance 
       WHERE agent_id = $1 
       ORDER BY month_year DESC LIMIT 1`,
      [agent_id]
    );
    agent.latest_performance = perfResult.rows[0] || null;
    
    return agent;
  },

  /**
   * Update agent status and broadcast via WebSocket
   */
  async updateAgentStatus(org_id: string, agent_id: string, status: string, availability_note?: string) {
    const result = await db.query(
      `UPDATE agents 
       SET current_status = $1, availability_note = $2, updated_at = NOW()
       WHERE org_id = $3 AND id = $4
       RETURNING *`,
      [status, availability_note || null, org_id, agent_id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // Invalidate cache
    await cache.del(`agents:${org_id}`);
    await cache.del(`agent:${agent_id}`);
    
    return result.rows[0];
  },

  /**
   * Get agents available for work (not offline, not at capacity)
   */
  async getAvailableAgents(org_id: string, filter: AvailabilityFilter) {
    let query = `
      SELECT a.*,
        (SELECT COUNT(*) FROM agent_assignments 
         WHERE agent_id = a.id AND status IN ('assigned', 'in_progress')) as active_task_count
      FROM agents a
      WHERE a.org_id = $1 
        AND a.is_active = true
        AND a.current_status != 'offline'
    `;
    
    const params: any[] = [org_id];
    
    if (filter.excludeBusy) {
      query += ` AND a.current_status != 'busy'`;
    }
    
    if (filter.specialization) {
      query += ` AND a.specialization @> $${params.length + 1}::jsonb`;
      params.push(JSON.stringify([filter.specialization]));
    }
    
    // Add capacity filter: active_task_count < max_concurrent_tasks
    query += ` AND (SELECT COUNT(*) FROM agent_assignments 
                     WHERE agent_id = a.id AND status IN ('assigned', 'in_progress'))
               < a.max_concurrent_tasks`;
    
    query += ` ORDER BY a.utilization_percent ASC, a.performance_score DESC`;
    
    const result = await db.query(query, params);
    return result.rows;
  },

  /**
   * Update agent profile
   */
  async updateAgent(org_id: string, agent_id: string, updates: any) {
    const allowedFields = ['name', 'email', 'phone', 'role', 'specialization', 'max_concurrent_tasks'];
    const updates_filtered: any = {};
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        if (field === 'specialization') {
          updates_filtered[field] = JSON.stringify(updates[field]);
        } else {
          updates_filtered[field] = updates[field];
        }
      }
    }
    
    if (Object.keys(updates_filtered).length === 0) {
      return this.getAgentDetail(org_id, agent_id);
    }
    
    const setClauses = Object.keys(updates_filtered)
      .map((key, index) => `${key} = $${index + 3}`)
      .join(', ');
    
    const result = await db.query(
      `UPDATE agents 
       SET ${setClauses}, updated_at = NOW()
       WHERE org_id = $1 AND id = $2
       RETURNING *`,
      [org_id, agent_id, ...Object.values(updates_filtered)]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    // Invalidate cache
    await cache.del(`agents:${org_id}`);
    await cache.del(`agent:${agent_id}`);
    
    return result.rows[0];
  },

  /**
   * Create a task assignment
   */
  async createAssignment(org_id: string, agent_id: string, input: CreateAssignmentInput) {
    // Verify agent exists
    const agentResult = await db.query(
      'SELECT id FROM agents WHERE org_id = $1 AND id = $2',
      [org_id, agent_id]
    );
    
    if (agentResult.rows.length === 0) {
      throw new Error('Agent not found');
    }
    
    // Create assignment
    const result = await db.query(
      `INSERT INTO agent_assignments 
       (agent_id, entity_type, entity_id, priority, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [agent_id, input.entity_type, input.entity_id, input.priority, 'assigned', input.description]
    );
    
    // Update agent utilization
    await this.recalculateAgentUtilization(agent_id);
    
    return result.rows[0];
  },

  /**
   * List assignments for an agent
   */
  async listAssignments(org_id: string, agent_id: string, filters: any) {
    let query = `
      SELECT aa.* FROM agent_assignments aa
      JOIN agents a ON aa.agent_id = a.id
      WHERE a.org_id = $1 AND aa.agent_id = $2
    `;
    
    const params: any[] = [org_id, agent_id];
    
    if (filters.status) {
      query += ` AND aa.status = $${params.length + 1}`;
      params.push(filters.status);
    }
    
    if (filters.priority) {
      query += ` AND aa.priority = $${params.length + 1}`;
      params.push(filters.priority);
    }
    
    query += ` ORDER BY aa.priority DESC, aa.created_at DESC`;
    
    const result = await db.query(query, params);
    return result.rows;
  },

  /**
   * Update assignment status and calculate resolution time
   */
  async updateAssignmentStatus(org_id: string, assignment_id: string, updates: any) {
    const { status, resolution_time, notes } = updates;
    
    // Get current assignment
    const currentResult = await db.query(
      `SELECT aa.*, a.id as agent_id 
       FROM agent_assignments aa
       JOIN agents a ON aa.agent_id = a.id
       WHERE a.org_id = $1 AND aa.id = $2`,
      [org_id, assignment_id]
    );
    
    if (currentResult.rows.length === 0) {
      return null;
    }
    
    const current = currentResult.rows[0];
    let calc_resolution_time = resolution_time;
    
    // Calculate resolution time if status is moving to completed
    if (status === 'completed' && current.status !== 'completed') {
      const createdTime = new Date(current.created_at).getTime();
      const now = Date.now();
      calc_resolution_time = Math.round((now - createdTime) / 1000); // in seconds
    }
    
    const result = await db.query(
      `UPDATE agent_assignments 
       SET status = $1, resolution_time = $2, notes = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [status, calc_resolution_time || null, notes || null, assignment_id]
    );
    
    // Update agent utilization
    await this.recalculateAgentUtilization(current.agent_id);
    
    // Record monthly performance metric
    if (status === 'completed') {
      await this.recordPerformanceMetric(current.agent_id, 'completion', calc_resolution_time);
    }
    
    return result.rows[0];
  },

  /**
   * Get performance metrics for an agent
   */
  async getPerformanceMetrics(org_id: string, agent_id: string) {
    const result = await db.query(
      `SELECT a.performance_score, a.resolution_time_avg, a.accuracy_percent,
         a.tasks_completed, a.utilization_percent,
         (SELECT COUNT(*) FROM agent_assignments 
          WHERE agent_id = a.id AND status = 'escalated') as escalation_count,
         (SELECT COUNT(*) FROM agent_assignments 
          WHERE agent_id = a.id AND status IN ('assigned', 'in_progress')) as active_assignments
       FROM agents a
       WHERE a.org_id = $1 AND a.id = $2`,
      [org_id, agent_id]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  },

  /**
   * Get team-wide performance summary
   */
  async getTeamPerformance(org_id: string) {
    const result = await db.query(
      `SELECT 
         COUNT(*) as total_agents,
         AVG(performance_score) as avg_performance_score,
         AVG(utilization_percent) as avg_utilization,
         AVG(accuracy_percent) as avg_accuracy,
         SUM(tasks_completed) as total_tasks_completed,
         (SELECT COUNT(*) FROM agent_assignments aa
          JOIN agents a ON aa.agent_id = a.id
          WHERE a.org_id = $1 AND aa.status IN ('assigned', 'in_progress')) as active_tasks
       FROM agents
       WHERE org_id = $1 AND is_active = true`,
      [org_id]
    );
    
    return result.rows[0];
  },

  /**
   * Intelligent task routing: Find best agent based on specialization, utilization, and performance
   */
  async routeTaskIntelligently(org_id: string, input: RouteTaskInput) {
    // Find available agents that match specialization
    const availableQuery = `
      SELECT a.*, 
        (SELECT COUNT(*) FROM agent_assignments 
         WHERE agent_id = a.id AND status IN ('assigned', 'in_progress')) as active_task_count
      FROM agents a
      WHERE a.org_id = $1 
        AND a.is_active = true
        AND a.current_status != 'offline'
        AND (SELECT COUNT(*) FROM agent_assignments 
             WHERE agent_id = a.id AND status IN ('assigned', 'in_progress'))
            < a.max_concurrent_tasks
    `;
    
    const params: any[] = [org_id];
    
    if (input.required_specialization) {
      const availableQuery_with_spec = availableQuery + 
        ` AND a.specialization @> $${params.length + 1}::jsonb`;
      params.push(JSON.stringify([input.required_specialization]));
      
      let result = await db.query(availableQuery_with_spec, params);
      
      // If no agents with specialization, fall back to general available agents
      if (result.rows.length === 0) {
        result = await db.query(availableQuery, [org_id]);
      }
    } else {
      const result = await db.query(availableQuery, params);
    }
    
    const availableResult = await db.query(availableQuery, [org_id]);
    const available = availableResult.rows;
    
    if (available.length === 0) {
      return null; // No available agents
    }
    
    // Score agents: prioritize by utilization and performance
    // Lower utilization is better, higher performance is better
    const scored = available.map(agent => ({
      ...agent,
      score: (agent.performance_score * 0.6) + 
             ((100 - agent.utilization_percent) * 0.4)
    }));
    
    // Select highest-scored agent
    const bestAgent = scored.sort((a, b) => b.score - a.score)[0];
    
    // Create assignment
    return this.createAssignment(org_id, bestAgent.id, {
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      priority: input.priority,
      description: `Auto-routed task (${input.required_specialization || 'general'})`,
    });
  },

  /**
   * Recalculate agent utilization based on active task count
   */
  async recalculateAgentUtilization(agent_id: string) {
    const result = await db.query(
      `SELECT max_concurrent_tasks,
         (SELECT COUNT(*) FROM agent_assignments 
          WHERE agent_id = $1 AND status IN ('assigned', 'in_progress')) as active_count
       FROM agents WHERE id = $1`,
      [agent_id]
    );
    
    if (result.rows.length === 0) return;
    
    const { max_concurrent_tasks, active_count } = result.rows[0];
    const utilization = Math.round((active_count / max_concurrent_tasks) * 100);
    
    await db.query(
      `UPDATE agents SET utilization_percent = $1, updated_at = NOW()
       WHERE id = $2`,
      [utilization, agent_id]
    );
  },

  /**
   * Record performance metrics for monthly tracking
   */
  async recordPerformanceMetric(agent_id: string, metric_type: string, value: any) {
    // This is called when assignments complete
    // In a full implementation, would aggregate monthly and update agent_performance table
    // For now, update the agent's running averages
    
    if (metric_type === 'completion') {
      // Update agent's resolution_time_avg
      await db.query(
        `UPDATE agents 
         SET resolution_time_avg = 
           (CASE 
             WHEN tasks_completed > 0 
             THEN (resolution_time_avg * tasks_completed + $1) / (tasks_completed + 1)
             ELSE $1
            END),
           tasks_completed = tasks_completed + 1,
           updated_at = NOW()
         WHERE id = $2`,
        [value, agent_id]
      );
    }
  },
};
