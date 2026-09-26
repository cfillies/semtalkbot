debugger;
import { LenaRuntime } from "./runtime";
import { RuleBasedAgent } from "./agent";
import { Blackboard } from "./blackboard";

const runtime = new LenaRuntime(
    new RuleBasedAgent(),
    {
        riskScore: 0,
        hypotheses: {},
        events: []
    }
);

async function run() {

    const result = await runtime.step([

        {
            id: "1",
            type: "SleepProblemReported",
            timestamp: Date.now(),
            source: "conversation",
            confidence: 0.9,
            payload: {
                durationDays: 21
            }
        }

    ]);

    console.log(JSON.stringify(result, null, 2));
}

run();