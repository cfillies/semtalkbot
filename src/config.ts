// const env = process.env.NODE_ENV; // 'development' or 'production';
// const eappstartloginpageurl = process.env.REACT_APP_START_LOGIN_PAGE_URL; // e.g. /auth-start
// const eapiendpoint = process.env.REACT_APP_API_ENDPOINT; // e.g. http://localhost:7071/api/
// const eapiBackupEndpoint = process.env.REACT_APP_API_BACKUPENDPOINT; // e.g. https://semmongo4.azurewebsites.net/api/
// const escopes = process.env.REACT_APP_SCOPES; 
// const edefaultscope = process.env.REACT_APP_DEFAULT_SCOPE; 
// const egraphscopes = process.env.REACT_APP_GRAPH_SCOPES; // für getGraphAccessToken
// const eclientId = process.env.REACT_APP_CLIENT_ID; // Application (client) ID of app registration für getGraphAccessToken
// const eclientSecret = process.env.REACT_APP_CLIENT_SECRET; // Client secret of app registration für getGraphAccessToken
// const eauthorityHost = process.env.REACT_APP_AUTHORITY; // e.g. https://login.microsoftonline.com/common
// const esharepointsite = process.env.REACT_APP_SHAREPOINT_SITE; // e.g. /sites/semtalk.sharepoint.com:/sites/Modellierung:/
// const esemtalkdocuments = process.env.REACT_APP_SEMTALK_DOCUMENTS; // e.g. SDX
// const esemtalkfolder = process.env.REACT_APP_SEMTALK_FOLDER; // e.g. ""
// const esemtalkapproved = process.env.REACT_APP_SEMTALK_APPROVED; // e.g. SDX
// const elanguage = process.env.REACT_APP_LANGUAGE; // e.g. de
// const eguilanguage = process.env.REACT_APP_GUI_LANGUAGE; // e.g. de
// const edefaultLanguage = process.env.REACT_APP_DEFAULT_LANGUAGE; // e.g. English
// const edefaultFont = process.env.REACT_APP_DEFAULT_FONT; // e.g. '"Segoe UI Web (West European)", Segoe UI, -apple-system, BlinkMacSystemFont, Roboto, Helvetica Neue, sans-serif'  
// const etenantId = process.env.REACT_APP_TENANT_ID; // Directory (tenant) ID of app registration
// const ereactAppIdUri = process.env.REACT_APP_ID_URI; // Application ID URI of app registration
// const ereactAuthority = process.env.REACT_APP_AUTHORITY; // e.g. https://login.microsoftonline.com/{tenantId}
// const ereactRedirectUri = process.env.REACT_APP_REDIRECT_URI; // e.g. http://localhost:3000
// const eopenaikey = process.env.REACT_APP_OPENAI_KEY; // e.g. sk-xxxxxxxx
// const eopenaibaseurl = process.env.REACT_APP_OPENAI_API_BASE; // e.g. https://api.openai.com/v1/
const eappstartloginpageurl = undefined; // e.g. /auth-start
const eapiendpoint = undefined; // e.g. http://localhost:7071/api/
const eapiBackupEndpoint = undefined; // e.g. https://semmongo4.azurewebsites.net/api/
// const escopes  = undefined; 
// const edefaultscope = undefined; 
// const egraphscopes = undefined; // für getGraphAccessToken
const eclientId = undefined; // Application (client) ID of app registration für getGraphAccessToken
const eclientSecret = undefined; // Client secret of app registration für getGraphAccessToken
const eauthorityHost = undefined; // e.g. https://login.microsoftonline.com/common
const esharepointsite = undefined; // e.g. /sites/semtalk.sharepoint.com:/sites/Modellierung:/
const esemtalkdocuments = undefined; // e.g. SDX
const esemtalkfolder = undefined; // e.g. ""
const esemtalkapproved = undefined; // e.g. SDX
const elanguage = undefined; // e.g. de
const eguilanguage = undefined; // e.g. de
const edefaultLanguage = undefined; // e.g. English
const edefaultFont = undefined; // e.g. '"Segoe UI Web (West European)", Segoe UI, -apple-system, BlinkMacSystemFont, Roboto, Helvetica Neue, sans-serif'  
const etenantId = undefined; // Directory (tenant) ID of app registration
const ereactAppIdUri = undefined; // Application ID URI of app registration
const ereactAuthority = undefined; // e.g. https://login.microsoftonline.com/{tenantId}
const ereactRedirectUri = undefined; // e.g. http://localhost:3000
const eopenaikey = undefined; // e.g. sk-xxxxxxxx
const eopenaibaseurl = undefined; // e.g. https://api.openai.com/v1/
const eportalbackend = undefined;
const eportalconnection = undefined;
const eportaldb = undefined;
const eportallib = undefined;
const eportalstartfile = undefined;
const eportalstartdiagram = undefined;
const eportalribbon = undefined;
const eportalmode = undefined;
const eportalinstantrefine = undefined;
const eportalforcestartdiagram = undefined;
const epublishLibraries = undefined;
const epublishOptions = undefined;
const eaiserver = undefined;
// const eprocessmanagerendpoint = undefined;
// const eopenaideployment = process.env.REACT_APP_OPENAI_DEPLOYMENT; // e.g. gpt-4
// const eopenaimodel = process.env.REACT_APP_OPENAI_MODEL; // e.g. gpt-4714
// const eopenaiversion = process.env.REACT_APP_OPENAI_VERSION; // e.g. 2024-02-15-preview 

// You can change these values to your own app registration
// In a production app, these values should be provided by your backend
// and not be exposed to the client side
const config = {
  tenantId: etenantId ? etenantId : "common",
  reactAppIdUri: ereactAppIdUri ? ereactAppIdUri : "api://c91b1245-4b5d-471f-bb1f-f3117253421f",
  reactAuthority: ereactAuthority ? ereactAuthority : `https://login.microsoftonline.com/${etenantId ? etenantId : "common"}`,
  reactRedirectUri: ereactRedirectUri ? ereactRedirectUri : "https://bot44e7fd.azurewebsites.net" + "/",
  initiateLoginEndpoint: eappstartloginpageurl ? eappstartloginpageurl : "/auth-start",
  clientId: eclientId ? eclientId : "c91b1245-4b5d-471f-bb1f-f3117253421f", 
  apiEndpoint: eapiendpoint ? eapiendpoint : "/api/",
  apiBackupEndpoint: eapiBackupEndpoint ? eapiBackupEndpoint : "https://semmongo4.azurewebsites.net/api/",
  scopes: "ChatMessage.Send, Chat.ReadWrite, User.Read, Mail.Send, email, openid, profile, offline_access, Chat.Read, Chat.ReadWrite, ChatMessage.Send".split(', '),
  defaultscope: ["https://graph.microsoft.com/.default"],
  graphscopes: "ChatMessage.Send, Chat.ReadWrite, Mail.Send, email, openid, profile, Files.ReadWrite.All, offline_access, Sites.Manage.All, Sites.Read.All, Sites.ReadWrite.All, Tasks.ReadWrite, Team.Create, Team.ReadBasic.All, Directory.Read.All, User.Read".split(', '),
  clientSecret: eclientSecret ? eclientSecret : "",
  authorityHost: eauthorityHost ? eauthorityHost : "https://login.microsoftonline.com/common",
  sharepointsite: esharepointsite ? esharepointsite : "/sites/semtalk.sharepoint.com:/sites/Modellierung:/",
  semtalkdocuments: esemtalkdocuments ? esemtalkdocuments : "SDX",
  semtalkfolder: esemtalkfolder ? esemtalkfolder : "",
  semtalkapproved: esemtalkapproved ? esemtalkapproved : "SDX",
  language: elanguage ? elanguage : "de",
  guilanguage: eguilanguage ? eguilanguage : "de",
  defaultLanguage: edefaultLanguage ? edefaultLanguage : "English",
  defaultFont:  edefaultFont ? edefaultFont : '"Segoe UI Web (West European)", Segoe UI, -apple-system, BlinkMacSystemFont, Roboto, Helvetica Neue, sans-serif',
  openaiKey: eopenaikey ? eopenaikey : "sk-xxxxxxxx",
  openaiBaseUrl: eopenaibaseurl ? eopenaibaseurl : "https://api.openai.com/v1/",
  // openaiDeployment: eopenaideployment ? eopenaideployment : "gpt-4",
  // openaiModel: eopenaimodel ? eopenaimodel : "gpt-4714",
  // openaiVersion: eopenaiversion ? eopenaiversion : "2024-02-15-preview", 
  portalbackend: eportalbackend ? eportalbackend : "https://semaiservice26.azurewebsites.net/",
  portalconnection: eportalconnection ? eportalconnection : "",
  portaldb: eportaldb ? eportaldb : "",
  portallib: eportallib ? eportallib : "",
  portalstartfile: eportalstartfile ? eportalstartfile : "",
  portalstartdiagram: eportalstartdiagram ? eportalstartdiagram : "",
  portalribbon: eportalribbon ? eportalribbon : "",
  portalmode: eportalmode ? eportalmode : false,
  portalinstantrefine: eportalinstantrefine ? eportalinstantrefine : "CRTL",
  portalforcestartdiagram: eportalforcestartdiagram ? eportalforcestartdiagram : true,
  publishLibraries: epublishLibraries ? epublishLibraries : "",
  publishOptions: epublishOptions ? epublishOptions : [],
  aiserver: eaiserver ? eaiserver : "https://semaiservice26.azurewebsites.net/",
  // processManagerEndpoint: eprocessmanagerendpoint ? eprocessmanagerendpoint : undefined,
};

export default config;
