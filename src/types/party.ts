import type { CoreValue, DomainId } from './simulation';
import type { SupportAnalysis } from './politics';
export const PLAYER_PARTY_ID = 'player';
export interface PlayerParty {
  id: typeof PLAYER_PARTY_ID; name: string; shortName: string; color: string;
  values: [CoreValue, CoreValue, CoreValue]; foundedAt: string;
}
export interface Resources { money: number; staffCapacity: number; agendaSlots: number }
export interface Finance {
  members: number; initialMoney: number; arrears: number; staffLevel: number; ledgerTruncatedSum: number;
  ledger: { date: string; kind: 'dues' | 'payroll' | 'hiring' | 'research' | 'survey' | 'recruitment'; amount: number; balanceAfter: number; ref: string }[];
}
export interface Research { domain: DomainId; startedAt: string; completesAt: string }
export interface InternalSurvey { date: string; margin: number; analysis: SupportAnalysis }
