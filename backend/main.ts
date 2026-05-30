/**
 * Ledgr Backend Application Entry Point
 * Initializes Express server with all subsystems
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { createApp } from './server';
import { initializeIntegrationSystem, runMigrations, shutdownIntegrationSystem } from './lib/integration-init';

/**
 * Start application
 */
async function start(): Promise<void> {
  try {
    console.log('Starting Ledgr Backend...');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Database: ${process.env.DATABASE_URL ? 'configured' : 'NOT configured'}`);

    // Initialize integration system
    let integrationSystem: any = null;

    if (process.env.DATABASE_URL) {
      try {
        integrationSystem = await initializeIntegrationSystem();
        console.log('Integration system initialized');

        // Run pending migrations
        await runMigrations(integrationSystem.pool);
      } catch (error) {
        console.error('Failed to initialize integration system:', error);
        console.warn('Continuing with in-memory integration manager');
        integrationSystem = null;
      }
    }

    // Create Express app
    const app = createApp(
      integrationSystem?.manager,
      integrationSystem?.pool
    );

    // Start server
    const port = parseInt(process.env.PORT || '3000', 10);
    const server = app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
      console.log(`Health check: http://localhost:${port}/v1/health`);
      console.log(`Integration endpoints: http://localhost:${port}/v1/integrations`);
      console.log(`Webhook endpoints: http://localhost:${port}/v1/webhooks`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n${signal} received, shutting down gracefully...`);

      try {
        // Close HTTP server
        server.close(() => {
          console.log('HTTP server closed');
        });

        // Shutdown integration system
        if (integrationSystem?.manager && integrationSystem?.pool) {
          await shutdownIntegrationSystem(
            integrationSystem.manager,
            integrationSystem.pool
          );
        }

        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Unhandled promise rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  start();
}

export { start };
