import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from 'axios';

export const findProcesses = tool(
  async ({ name, model }) => {
    console.log("************Finding Processes named", name, model);
    let service = process.env.SEMTALK_AISERVICE_URL;
    if (!service) {
      service = "https://semaiservice.azurewebsites.net/";
    }
    // service = "http://localhost:7073/";
 
    let url = service + "api/findprocessWS";
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
        console.log("findProcesses: " + res.statusText);
        return [];
      }
    } catch (e) {
      console.log("findProcesses: " + e);
      return (e as any).message;
    }

  },
  {
    name: "FindProcesses",
    description:
      "Find a list of Process descriptions for a matching a Process name or part of a Process name.",
    schema: z.object({
      name: z.string(),
      model: z.string(),
    }),
  }
);