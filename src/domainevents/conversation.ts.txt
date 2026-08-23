export interface ObservationType {

    id: string;

    description: string;

    examples: string[];

    payloadSchema: any;
}

export const ObservationRegistry: ObservationType[] = [

    {
        id: "SleepProblemReported",

        description:
            "The user reports problems sleeping.",

        examples: [
            "I cannot sleep",
            "I wake up every night",
            "I never sleep through the night"
        ],

        payloadSchema: {
            severity: "string?",
            durationDays: "number?"
        }
    },

    {
        id: "AlcoholConsumptionReported",

        description:
            "The user reports drinking alcohol.",

        examples: [
            "I drink every evening"
        ],

        payloadSchema: {
            amountPerDay: "number?"
        }
    }

];

// Available observation types:

// SleepProblemReported
// Description:
// The user reports sleeping problems.

// AlcoholConsumptionReported
// Description:
// The user reports alcohol consumption.

// Return JSON only.

export interface ObservationCandidate {

    type: string;

    confidence: number;

    evidence: string;

    payload: Record<string, any>;
}

import { ChatOpenAI } from "@langchain/openai";
import { CrisisDetected, DomainEvent } from "./events";

export class ConversationInterpreter {

    constructor(private llm: ChatOpenAI) {}

    async interpret(userText: string) {

        const prompt = this.buildPrompt(userText);

        const result = await this.llm.invoke(prompt);

        return JSON.parse(result.content as string);
    }

    private buildPrompt(text: string) {

        const events =
            ObservationRegistry
                .map(e =>
`
${e.id}

${e.description}

Examples:

${e.examples.join("\n")}
`)
                .join("\n");

        return `
You are an Observation Extractor.

You receive one user utterance.

Return only Observation Candidates.

Available observations:

${events}

User:

${text}

Return JSON array only.
`;
    }

}

// export class ObservationMapper {

//     map(
//         candidates: ObservationCandidate[]
//     ): DomainEvent[] {

//         return candidates

//             .filter(c => c.confidence > 0.7)

//             .map(c => ({

//                 id: crypto.randomUUID(),

//                 type: c.type,

//                 timestamp: Date.now(),

//                 source: "conversation",

//                 confidence: c.confidence,

//                 payload: c.payload

//             }));
//     }

// }