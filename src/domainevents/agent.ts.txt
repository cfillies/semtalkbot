import { DomainEvent } from "./events";
import { Blackboard } from "./blackboard";

export interface CognitiveAgent {

    process(
        events: DomainEvent[],
        blackboard: Blackboard
    ): Promise<DomainEvent[]>;
}

export class LLMHypothesisAgent implements CognitiveAgent {

    constructor(private llm: any) {}

    async process(events: DomainEvent[], bb: Blackboard) {

        const prompt = {
            events,
            bb
        };

        const result = await this.llm.invoke(prompt);

        // expect JSON events
        return result.events as DomainEvent[];
    }
}

export class RuleBasedAgent implements CognitiveAgent {

    async process(events: DomainEvent[], bb: Blackboard) {

        const out: DomainEvent[] = [];

        for (const e of events) {

            if (e.type === "SleepProblemReported"
                && bb.riskScore > 0.5) {

                out.push({
                    id: crypto.randomUUID(),
                    type: "BurnoutHypothesisCreated",
                    timestamp: Date.now(),
                    source: "agent",
                    confidence: 0.7,
                    payload: {
                        confidence: 0.7,
                        contributingFactors: ["sleep", "stress"]
                    }
                });
            }
        }

        return out;
    }
}