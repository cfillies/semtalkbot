import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from 'axios';

export const findReferenceProcesses = tool(
  async ({ name }) => {
    console.log("************Finding Reference Processes named", name);
    let service = process.env.SEMTALK_AISERVICE_URL;
    if (!service) {
      service = "https://semaiservice26.azurewebsites.net/";
    }
    // service = "http://localhost:7073/";
 
    let url = service + "api/findReferenceProcessWS";
    let js = {
      "name": name
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
        console.log("findReferenceProcesses: " + res.statusText);
        return [];
      }
    } catch (e) {
      console.log("findReferenceProcesses: " + e);
      return (e as any).message;
    }

  },
  {
    name: "FindReferenceProcesses",
    description:
      "Find a list of Reference Model Process descriptions for a matching a Process name or part of a Process name.",
    schema: z.object({
      name: z.string()
    }),
  }
);