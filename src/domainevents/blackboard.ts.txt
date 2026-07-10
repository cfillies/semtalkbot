import { DomainEvent } from "./events";

export interface Hypothesis {
    type: string;
    confidence: number;
    supportingEvents: string[];
    contradictingEvents: string[];
}

export interface Blackboard {
    hypotheses: Record<string, Hypothesis>;
    riskScore: number;
    events: DomainEvent[];
}

export function reduceBlackboard(
    state: Blackboard,
    event: DomainEvent
): Blackboard {

    // append event log
    state.events.push(event);

    switch (event.type) {

        case "SleepProblemReported":

            state.riskScore += 0.2;
            break;

        case "AlcoholConsumptionReported":

            state.riskScore += 0.3;
            break;

        case "StressSignalDetected":

            state.riskScore += 0.25;
            break;

        case "BurnoutHypothesisCreated":

            state.hypotheses["burnout"] = {
                type: "burnout",
                confidence: event.payload.confidence,
                supportingEvents: [],
                contradictingEvents: []
            };
            break;

        case "BurnoutHypothesisUpdated":

            const h = state.hypotheses["burnout"];
            if (h) {
                h.confidence = event.payload.currentConfidence;
            }
            break;

        case "CrisisDetected":

            state.riskScore = 1.0;
            break;
    }

    return state;
}