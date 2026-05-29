import { RuntimeStateType } from "../runtime/state";

export async function processAgentNode(
  state: RuntimeStateType
): Promise<Partial<RuntimeStateType>> {

  console.log("[PROCESS AGENT]", state.userQuery);

  return {
    ...state,
    processResult: "dummy process result"
  };
}