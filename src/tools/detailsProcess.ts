import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from 'axios';

export const detailsProcess = tool(
  async ({ name, model }) => {
    console.log("************Finding Process Details", name, model);
    let service = process.env.SEMTALK_AISERVICE_URL;
    if (!service) {
      service = "https://semaiservice.azurewebsites.net/";
    }
    let url = service + "api/detailsprocessWS";
    let js = {
      "name": name,
      "model": model
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
      if ((res.status === 201 || res.status === 200) && res.data && res.data.length > 0) {
        return res.data;
      } else {
        console.log("detailsProcess: " + res.statusText);
        return res.statusText;
      }
    } catch (e) {
      console.log("detailsProcess: " + e);
      return (e as any).message;
    }

  },
  {
    name: "detailsProcess",
    description:
      "Get a detailed of Process description in BPMN for a matching a Process name.",
    schema: z.object({
      name: z.string(),
      model: z.string(),
    }),
  }
);