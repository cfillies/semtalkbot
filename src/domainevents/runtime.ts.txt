import { reduceBlackboard, Blackboard } from "./blackboard";
import { CognitiveAgent } from "./agent";
import { DomainEvent } from "./events";

export class LenaRuntime {

    constructor(
        private agent: CognitiveAgent,
        private blackboard: Blackboard
    ) {}

    async step(inputEvents: DomainEvent[]) {

        // 1. AGENT REASONING (EVENT → EVENT)
        const outputEvents =
            await this.agent.process(inputEvents, this.blackboard);

        // 2. REDUCE INPUT EVENTS
        for (const e of inputEvents) {
            this.blackboard = reduceBlackboard(this.blackboard, e);
        }

        // 3. REDUCE OUTPUT EVENTS
        for (const e of outputEvents) {
            this.blackboard = reduceBlackboard(this.blackboard, e);
        }

        // 4. RETURN NEW STATE
        return {
            blackboard: this.blackboard,
            newEvents: outputEvents
        };
    }
}