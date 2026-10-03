/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { 
    // IPublicClientApplication, 
    LogLevel, 
    // PublicClientApplication 
} from "@azure/msal-browser";
import config from "./config";

// export let defaultConfig: any = {
//     clientId: "c91b1245-4b5d-471f-bb1f-f3117253421f",
//     authorityHost: "https://login.microsoftonline.com/common",
//     clientSecret: ""
// }
// export function isDebugConfig(): boolean {
//     return (window.location.origin === "http://localhost:3000" || window.location.origin === "http://localhost:53000");
// }

/**
 * Configuration object to be passed to MSAL instance on creation. 
 * For a full list of MSAL.js configuration parameters, visit:
 * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-browser/docs/configuration.md 
 */
//  authority: "https://login.microsoftonline.com/e6aa0f5f-ec60-485d-8766-f6bcabea9053",
function getRedirectUri(): string {
  let redirectUri = "https://bot44e7fd.azurewebsites.net";
  if (redirectUri.endsWith("/")) {
    redirectUri = redirectUri.substr(0, redirectUri.length - 1);
  }
  if (!redirectUri || redirectUri === "") {
    redirectUri = "https://bot44e7fd.azurewebsites.net";
  }
  return redirectUri;
}

export let msalConfig = {
    auth: {
        clientId: config.clientId,
        authority: config.authorityHost,
        redirectUri: getRedirectUri(),
        postLogoutRedirectUri: "/"
    },
    cache: {
        cacheLocation: "localStorage", // This configures where your cache will be stored
        storeAuthStateInCookie: false, // Set this to "true" if you are having issues on IE11 or Edge
    },
    system: {
        loggerOptions: {
            loggerCallback: (level: any, message: any, containsPii: any) => {
                if (containsPii) {
                    return;
                }
                switch (level) {
                    case LogLevel.Error:
                        console.error(message);
                        return;
                    case LogLevel.Info:
                        // console.info(message);		
                        return;
                    case LogLevel.Verbose:
                        console.debug(message);
                        return;
                    case LogLevel.Warning:
                        console.warn(message);
                        return;
                }
            }
        }
    }
};