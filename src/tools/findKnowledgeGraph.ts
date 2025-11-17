import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from 'axios';

export const findKnowledgeGraph = tool(
  async ({ name, model }) => {
    console.log("************Finding Knowledge Graph named", name, model);
    let service = process.env.SEMTALK_AISERVICE_URL;
    if (!service) {
      service = "https://semaiservice.azurewebsites.net/";
    }
    // service = "http://localhost:7073/";
 
    let url = service + "api/findknowledgegraphWS";
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
        console.log("Finding Knowledge Graph: " + res.statusText);
        return [];
      }
    } catch (e) {
      console.log("Finding Knowledge Graph: " + e);
      return (e as any).message;
    }

  },
  {
    name: "FindKnowledgeGraph",
    description:
      "Find Returns a list of Knowledge Graphs for a matching a name.",
    schema: z.object({
      name: z.string(),
      model: z.string(),
    }),
  }
);