/**
 * TypeScript types for ReguScape
 */

// ---- Search Input Types ----

export type SearchMode = 'address' | 'gush-helka';

export interface AddressSearchParams {
  mode: 'address';
  query: string; // free-text address e.g. "רוטשילד 1 תל אביב"
}

export interface GushHelkaSearchParams {
  mode: 'gush-helka';
  gush: string;
  helka: string;
}

export type SearchParams = AddressSearchParams | GushHelkaSearchParams;

// ---- GovMap API Response Types ----

export interface GovMapSearchResult {
  Y: number;        // ITM Y coordinate
  X: number;        // ITM X coordinate
  ResultLable: string;
  ObjectID: string;
  ResultType: number;
  DescLayerID: string;
  Alert: string | null;
  Gush: string;
  Parcel: string;
  ObjectIDType: string;
  ObjectKey: string;
  LayerName: number;
  AData: Record<string, string>;
  MetaData: { geometryType: string };
}

export interface GovMapSearchResponse {
  data: Record<string, GovMapSearchResult[]>;
  order: string[];
  Error: number;
  ErrorMsg: string | null;
}

// ---- Application Domain Types ----

export interface LocationInfo {
  label: string;
  x: number; // ITM X
  y: number; // ITM Y
  gush?: string;
  helka?: string;
  objectId?: string;
}

export interface PlanInfo {
  planNumber: string;
  planName: string;
  planStatus?: string;
  planType?: string;
  authority?: string;
  locality?: string;
  place?: string;
  takanonUrl?: string;
  planPageUrl?: string;
  lotSizeSqm?: number;
  maxFloors?: number;
  maxBuildableAreaSqm?: number;
  source?: string;
}

export interface SearchResult {
  location: LocationInfo;
  plans: PlanInfo[];
  govmapUrl: string;
  searchTimestamp: string;
  searchDuration: number;
  externalLinks?: ExternalLinks;
}

// ---- Land Plot Identifiers API ----

export interface LandPlotIdentifiers {
  gush: string;
  helka: string;
  addresses: string[];
}

// ---- Taba Info API ----

export interface TabaInfo {
  taba_code: string;
  taba_description: string;
  plan_status?: string;
  locality?: string;
  place?: string;
  takanon_url?: string;
  plan_page_url?: string;
  lot_size_sqm?: number;
  max_floors?: number;
  max_buildable_area_sqm?: number;
  source?: string;
}

export interface TabaPlansResponse {
  plans: TabaInfo[];
  govmap_taba_url?: string;
  iplan_url?: string;
}

// ---- Building Regulations API ----

export interface BuildingRegulations {
  max_floors: number;
  max_buildable_area_sqm: number;
  govmap_url?: string;
}

// ---- External Links ----

export interface ExternalLinks {
  govmapTabaUrl?: string;
  govmapParcelUrl?: string;
  iplanUrl?: string;
}

// ---- Parcel Registration & Usage Code (MAVAT) ----

export interface ParcelRegistrationInfo {
  taba_info: string;
  mavat_info: string;
  region_code: string;
  parcel_number: string;
}

export interface ParcelUsageCode {
  usage_code: string;
  description: string;
  region_code: string;
  parcel_number: string;
}

// ---- Enriched Search Result ----

export interface EnrichedSearchResult extends SearchResult {
  landPlot?: LandPlotIdentifiers;
  taba?: TabaInfo;
  tabaPlans?: TabaInfo[];
  regulations?: BuildingRegulations;
  parcelRegistration?: ParcelRegistrationInfo;
  parcelUsageCode?: ParcelUsageCode;
  externalLinks?: ExternalLinks;
}

// ---- API Response Types ----

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type SearchApiResponse = ApiResponse<EnrichedSearchResult>;
