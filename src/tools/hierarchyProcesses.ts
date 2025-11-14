import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from 'axios';

export const hierarchyProcesses = tool(
  async ({ name, model }) => {
    console.log("************Finding Process Hierarchy", name, model);
    let service = process.env.SEMTALK_AISERVICE_URL;
    if (!service) {
      service = "https://semaiservice.azurewebsites.net/";
    }
    // service = "http://localhost:7073/";

    let url = service + "api/hierarchyProcessesWS";
    let js = {
      "name": name,
      "model": "*"
    };
    let c = {
      "headers": {
        "Accept": 'application/json', "Content-Type": 'application/json',
        "Access-Control-Allow-Origin": "*"
      },
    };

    try {
      let res = await axios.post(url, js, c
      );
      if ((res.status === 201 || res.status === 200) && res.data && res.data.body && res.data.body.result) {
        return JSON.stringify(res.data.body.result);
      } else {
        console.log("hierarchyProcesses: " + res.statusText);
        return res.statusText;
      }
    } catch (e) {
      console.log("hierarchyProcesses: " + e);
      return (e as any).message;
    }

  },
  {
    name: "hierarchyProcesses",
    description:
      "Returns callers hierarchy of a Process in JSON for a matching a Process name.",
    schema: z.object({
      name: z.string(),
      model: z.string(),
    }),
  }
);