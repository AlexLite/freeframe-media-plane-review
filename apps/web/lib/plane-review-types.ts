export interface PlaneReviewContext {
  workspace_id: string
  project_id: string
  issue_id: string
}

export interface PlaneReviewShadowUser {
  id: string
  plane_user_id: string
  email: string
  name: string
}

export interface PlaneSessionExchangeResponse {
  access_token: string
  expires_in: number
  user: PlaneReviewShadowUser
  context: PlaneReviewContext
  scopes: string[]
}

export interface PlaneReviewPermissions {
  read: boolean
  comment: boolean
  upload: boolean
  manage: boolean
}

export interface PlaneReviewVersionSummary {
  id: string
  version_number: number
  processing_status: 'uploading' | 'processing' | 'ready' | 'failed' | string
  created_by: string
  created_at: string | null
  original_filename: string | null
  mime_type: string | null
  file_size_bytes: number | null
}

export interface PlaneReviewAssetSummary {
  id: string
  name: string
  asset_type: 'video' | 'image' | 'audio' | string
  description?: string | null
  thumbnail_url?: string | null
}

export interface PlaneReviewBootstrapResponse<TAsset = PlaneReviewAssetSummary> {
  context: PlaneReviewContext
  asset: TAsset
  versions: PlaneReviewVersionSummary[]
  permissions: PlaneReviewPermissions
}

export interface PlaneReviewStreamResponse {
  url: string
  asset_type: 'video' | 'image' | 'audio' | string
  expires_in: number
}
