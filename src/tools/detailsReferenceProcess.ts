import { tool } from "@langchain/core/tools";
import { z } from "zod";
import axios from 'axios';

export const detailsReferenceProcess = tool(
  async ({ name }) => {
    console.log("************Finding Reference Process Details", name);
    let service = process.env.SEMTALK_AISERVICE_URL;
    if (!service) {
      service = "https://semaiservice26.azurewebsites.net/";
    }
    // service = "http://localhost:7073/";

    let url = service + "api/detailsReferenceProcessWS";
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
        console.log("detailsReferenceProcess: " + res.statusText);
        return res.statusText;
      }
    } catch (e) {
      console.log("detailsReferenceProcess: " + e);
      return (e as any).message;
    }

  },
  {
    name: "detailsReferenceProcess",
    description:
      "Get a detailed of Reference Process description in EPML style json for a matching a Process name.",
    schema: z.object({
      name: z.string()
    }),
  }
);