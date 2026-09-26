export type DomainEvent =
    | SleepProblemReported
    | AlcoholConsumptionReported
    | StressSignalDetected
    | BurnoutHypothesisCreated
    | BurnoutHypothesisUpdated
    | CrisisDetected;
    // | "RiskLevelChanged";

export interface BaseEvent {
    id: string;
    timestamp: number;
    source: "conversation" | "agent" | "service";
    confidence?: number;
}

// 1.1 Input Events (Observations)

export interface SleepProblemReported extends BaseEvent {
    type: "SleepProblemReported";
    payload: {
        durationDays: number;
        severity?: "low" | "medium" | "high";
    };
}

export interface AlcoholConsumptionReported extends BaseEvent {
    type: "AlcoholConsumptionReported";
    payload: {
        amountPerDay: number;
    };
}

export interface StressSignalDetected extends BaseEvent {
    type: "StressSignalDetected";
    payload: {
        intensity: number;
    };
}

// 1.2 Output Events (Agent Reasoning)

export interface BurnoutHypothesisCreated extends BaseEvent {
    type: "BurnoutHypothesisCreated";
    payload: {
        confidence: number;
        contributingFactors: string[];
    };
}

export interface BurnoutHypothesisUpdated extends BaseEvent {
    type: "BurnoutHypothesisUpdated";
    payload: {
        confidenceDelta: number;
        currentConfidence: number;
    };
}

export interface CrisisDetected extends BaseEvent {
    type: "CrisisDetected";
    payload: {
        riskLevel: "medium" | "high" | "critical";
        reason: string;
    };
}