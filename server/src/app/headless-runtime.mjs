import { randomUUID } from 'node:crypto'
import { createGatewayApplication } from './gateway-application.mjs'
import { TaskManager } from '../task/task-manager.mjs'
import { TaskStore } from '../task/task-store.mjs'
import { ConversationSync } from '../conversation/conversation-sync.mjs'

export class VolatileSessionJournal {
  constructor({ append = null } = {}) {
    this.appendRecord = append
    this.pending = Promise.resolve()
  }

  append(record) {
    if (!this.appendRecord) return Promise.resolve(null)
    const snapshot = structuredClone(record)
    this.pending = this.pending.then(() => this.appendRecord(snapshot))
    return this.pending
  }

  readAllSync() { return [] }
  flush() { return this.pending }
}

// Spec: SeparateConversationContexts, SetupInLoft, TruthfulExecution.
export function createHeadlessRuntime({
  config,
  agent,
  logger,
  taskStore = new TaskStore(),
  sessionJournal = new VolatileSessionJournal(),
  createTaskId = randomUUID,
  ...options
} = {}) {
  if (!config || !agent) throw new TypeError('config and agent are required')
  const taskManager = new TaskManager({
    store: taskStore,
    sessionJournal,
    createTaskId,
    executionEvidenceRequired: true,
    logger,
    maxConcurrent: config.taskMaxConcurrent,
    maxConcurrentPerOwner: config.taskMaxConcurrentPerOwner,
  })
  const application = createGatewayApplication({
    ...options,
    config: {
      ...config,
      frontendNotesPath: null,
      memoryAuditPath: null,
      memoryAutoEnabled: false,
      sessionDigestEnabled: false,
      reminderSchedulerEnabled: false,
    },
    agent,
    logger,
    taskManager,
    taskStore,
    sessionJournal,
    conversationSync: new ConversationSync(),
    autoStart: false,
    transport: false,
    offlineNotifications: false,
    moduleFactories: [],
    frontendMcp: null,
    frontendOpenApi: null,
    publicEndpoint: null,
    webSearchProvider: null,
  })
  return {
    services: application.services,
    async close() {
      await Promise.all([agent.close(), application.close()])
    },
  }
}
