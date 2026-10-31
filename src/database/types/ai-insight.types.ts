export type AiInsightStatus = 'pending' | 'ready' | 'error'

/** `scope` = kind métier (ex. ca_daily_digest). */
export type AiInsightScope =
  | 'ca_daily_digest'
  | 'ca_monthly_digest'
  | 'ca_yearly_digest'
  | 'ca_staff_person_digest'
  | 'ca_staff_year_digest'
  | 'bureau_since_yesterday'
  | 'staff_vivier_digest'
  | 'bureau_declaration_monthly'
  | 'terrain_day_anomalies'
  | 'planning_week_summary'
  | 'intervention_edt_week'
  | 'closing_vision_seau'
  | 'closing_vision_parking'
  | 'closing_vision_telecollecte'
  | 'opening_vision_nettoyage'
  | 'bureau_weekly_declaration'
  | 'terrain_forms_week'
  | 'suggestions_cluster_digest'
  | (string & {})

export interface AiInsightRow {
  id: number
  scope: AiInsightScope
  scope_key: string
  input_hash: string
  prompt_version: number
  content: string
  model: string | null
  status: AiInsightStatus
  payload: Record<string, unknown>
  error: string | null
  prompt_tokens: number | null
  completion_tokens: number | null
  created_at: string
  updated_at: string
}
