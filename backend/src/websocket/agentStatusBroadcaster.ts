// @ts-nocheck
import { WebSocket } from 'ws';
import { Server } from 'http';

/**
 * Real-time agent status broadcaster
 * Maintains WebSocket connections per organization and broadcasts agent status changes
 */

interface ClientConnection {
  ws: WebSocket;
  org_id: string;
  user_id: string;
  connected_at: Date;
}

class AgentStatusBroadcaster {
  private clients: Map<string, ClientConnection[]> = new Map();
  private wss: any = null;

  /**
   * Initialize WebSocket server
   */
  initializeWebSocket(server: Server) {
    const WebSocketServer = require('ws').Server;
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket, req: any) => {
      // Extract org_id and user_id from query params
      const url = new URL(req.url, `http://${req.headers.host}`);
      const org_id = url.searchParams.get('org_id');
      const user_id = url.searchParams.get('user_id');

      if (!org_id || !user_id) {
        ws.close(4000, 'org_id and user_id required');
        return;
      }

      // Register client
      const client: ClientConnection = {
        ws,
        org_id,
        user_id,
        connected_at: new Date(),
      };

      if (!this.clients.has(org_id)) {
        this.clients.set(org_id, []);
      }
      this.clients.get(org_id)!.push(client);

      console.log(`[WebSocket] Client ${user_id} connected to org ${org_id}`);

      // Send connection confirmation
      ws.send(JSON.stringify({
        type: 'connected',
        org_id,
        timestamp: new Date().toISOString(),
      }));

      // Handle incoming messages
      ws.on('message', (data: any) => {
        try {
          const message = JSON.parse(data);
          this.handleClientMessage(client, message);
        } catch (error) {
          console.error('[WebSocket] Failed to parse message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format',
          }));
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        const orgClients = this.clients.get(org_id);
        if (orgClients) {
          const index = orgClients.findIndex(c => c.ws === ws);
          if (index >= 0) {
            orgClients.splice(index, 1);
          }
        }
        console.log(`[WebSocket] Client ${user_id} disconnected from org ${org_id}`);
      });

      // Handle errors
      ws.on('error', (error: Error) => {
        console.error('[WebSocket] Error:', error);
      });
    });

    console.log('[WebSocket] Server initialized');
  }

  /**
   * Handle messages from clients
   */
  private handleClientMessage(client: ClientConnection, message: any) {
    switch (message.type) {
      case 'ping':
        client.ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
        break;

      case 'subscribe_agent':
        // Client wants to subscribe to specific agent status updates
        // Could implement per-agent subscriptions if needed
        console.log(`[WebSocket] Client subscribed to agent ${message.agent_id}`);
        client.ws.send(JSON.stringify({
          type: 'subscribed',
          agent_id: message.agent_id,
        }));
        break;

      default:
        console.log(`[WebSocket] Unknown message type: ${message.type}`);
    }
  }

  /**
   * Broadcast agent status update to all clients in an organization
   */
  broadcastAgentStatusUpdate(org_id: string, agent: any) {
    const orgClients = this.clients.get(org_id);
    if (!orgClients || orgClients.length === 0) {
      return; // No clients for this org
    }

    const message = JSON.stringify({
      type: 'agent_status_update',
      agent: {
        id: agent.id,
        name: agent.name,
        role: agent.role,
        current_status: agent.current_status,
        utilization_percent: agent.utilization_percent,
        performance_score: agent.performance_score,
        availability_note: agent.availability_note,
        updated_at: agent.updated_at,
      },
      timestamp: new Date().toISOString(),
    });

    // Send to all connected clients in this org
    orgClients.forEach(client => {
      if (client.ws.readyState === 1) { // OPEN
        client.ws.send(message);
      }
    });

    console.log(`[WebSocket] Broadcast agent status update for agent ${agent.id} to ${orgClients.length} clients in org ${org_id}`);
  }

  /**
   * Broadcast agent assignment update
   */
  broadcastAssignmentUpdate(org_id: string, assignment: any) {
    const orgClients = this.clients.get(org_id);
    if (!orgClients || orgClients.length === 0) {
      return;
    }

    const message = JSON.stringify({
      type: 'assignment_update',
      assignment: {
        id: assignment.id,
        agent_id: assignment.agent_id,
        entity_type: assignment.entity_type,
        entity_id: assignment.entity_id,
        status: assignment.status,
        priority: assignment.priority,
        resolution_time: assignment.resolution_time,
        updated_at: assignment.updated_at,
      },
      timestamp: new Date().toISOString(),
    });

    orgClients.forEach(client => {
      if (client.ws.readyState === 1) { // OPEN
        client.ws.send(message);
      }
    });

    console.log(`[WebSocket] Broadcast assignment update to ${orgClients.length} clients in org ${org_id}`);
  }

  /**
   * Broadcast team performance metrics
   */
  broadcastTeamPerformanceUpdate(org_id: string, metrics: any) {
    const orgClients = this.clients.get(org_id);
    if (!orgClients || orgClients.length === 0) {
      return;
    }

    const message = JSON.stringify({
      type: 'team_performance_update',
      metrics,
      timestamp: new Date().toISOString(),
    });

    orgClients.forEach(client => {
      if (client.ws.readyState === 1) { // OPEN
        client.ws.send(message);
      }
    });

    console.log(`[WebSocket] Broadcast team performance update to ${orgClients.length} clients in org ${org_id}`);
  }

  /**
   * Get connection count for an organization
   */
  getConnectionCount(org_id: string): number {
    return this.clients.get(org_id)?.length || 0;
  }

  /**
   * Get all connection stats
   */
  getStats() {
    let totalConnections = 0;
    const orgStats: { [key: string]: number } = {};

    for (const [org_id, clients] of this.clients) {
      const activeCount = clients.filter(c => c.ws.readyState === 1).length;
      orgStats[org_id] = activeCount;
      totalConnections += activeCount;
    }

    return {
      totalConnections,
      orgStats,
      activeOrgs: Object.keys(orgStats).length,
    };
  }
}

// Singleton instance
export const broadcaster = new AgentStatusBroadcaster();

/**
 * Export function for routes to use
 */
export function broadcastAgentStatusUpdate(org_id: string, agent: any) {
  broadcaster.broadcastAgentStatusUpdate(org_id, agent);
}

export function broadcastAssignmentUpdate(org_id: string, assignment: any) {
  broadcaster.broadcastAssignmentUpdate(org_id, assignment);
}

export function broadcastTeamPerformanceUpdate(org_id: string, metrics: any) {
  broadcaster.broadcastTeamPerformanceUpdate(org_id, metrics);
}

/**
 * Broadcast system status message to all connected clients
 */
export function broadcastSystemStatus(type: string, data: any) {
  const message = {
    type: 'system_status',
    status_type: type,
    data,
    timestamp: new Date().toISOString()
  };

  for (const clients of broadcaster.clients.values()) {
    for (const client of clients) {
      if (client.ws.readyState === 1) {
        client.ws.send(JSON.stringify(message));
      }
    }
  }
}
