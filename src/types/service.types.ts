export type ServiceConfig = {
  restartOnFailure?: boolean
}

export type ServiceDefinition = {
  config?: ServiceConfig
  start: () => Promise<void>
  stop?: () => Promise<void>
  status?: () => Promise<any>
}
