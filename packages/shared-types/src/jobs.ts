// BullMQ job payload types — one per queue

export interface ParseDocumentJobPayload {
  documentId: string
  projectId: string
  storageUrl: string
  format: 'pdf' | 'docx' | 'markdown' | 'openapi' | 'postman'
  ownerId: string
}

export interface AnalyzeRepoJobPayload {
  repositoryConnectionId: string
  projectId: string
  cloneUrl: string
  branch: string
  credentialId: string
  ownerId: string
}

export interface GenerateTestsJobPayload {
  projectId: string
  runId: string
  endpointIds: string[]
  ownerId: string
  baseUrl: string
  testType?: 'api' | 'browser'
}

export interface GenerateBrowserTestsJobPayload {
  projectId: string
  runId: string
  pageUrls: string[]
  ownerId: string
  baseUrl: string
}

export interface ExecuteTestsJobPayload {
  projectId: string
  runId: string
  environmentId: string
  testIds: string[]
  workerType: 'api' | 'browser'
  ownerId: string
  baseUrl: string
}

export interface ClassifyFailuresPayload {
  projectId: string
  runId: string
  baseUrl?: string   // passed through so reporter can make contract probe calls
}

export interface GenerateReportJobPayload {
  projectId: string
  runId: string
}

export interface HealTestPayload {
  projectId: string
  testId: string
  stepId: string
  failedSelector: string
  pageUrl: string
}

export interface CodeAnalysisJobPayload {
  projectId: string
  runId: string
  ownerId: string
  language: string           // java | python | csharp | go | etc.
  analysisTypes: string[]    // code_structure | api_pattern | auth_security | sql_security | data_exposure | multi_tenant | hipaa
}

export interface SchemaAnalysisJobPayload {
  projectId: string
  runId: string
  ownerId: string
  schemaContent: string      // raw SQL (CREATE TABLE statements or migration content)
  analysisTypes: string[]    // table_structure | constraints | indexes | naming | multi_tenant | hipaa
}
