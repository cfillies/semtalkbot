import { RuntimeStateType } from "../runtime/state";

export async function aggregateNode(
  state: RuntimeStateType
): Promise<Partial<RuntimeStateType>> {

  return {
    ...state,
    finalResponse:
      state.processResult ?? "no result"
  };
}