export enum SemTalkOnlineBPMNCommand {
  UploadBPMNFile = "UploadBPMNFile",
  DownloadBPMNFile = "DownloadBPMNFile"

}

export enum BPMN_ElementName {
  SLDecision = "SLDecision",
  // SLEvent = "SLEvent",
  // SLActivity = "SLActivity",
  SLSequenceFlow = "SLSequenceFlow",
  SLMessageFlow = "SLMessageFlow",
  // SLControl = "SLControl",
  SLSystem = "SLSystem",
  SLAssociation = "SLAssociation",
  FlowObject = "Flow Object",
  BPMNElement = "BPMN Element",
  Participant = "Participant",
  Task = "Task",
  Activity = "Activity",
  Gateway = "Gateway",
  Event = "Event",
  System = "System",
  DataObject = "Data Object",
  FlowChartElement = "FlowChartElement",
  Artifact = "Artifact",
  Annotation = "Annotation",
  Entity = "Entity",
  Comment = "Comment",
  SLPolicy = "Policy",
  SLDataSource = "Data Source",
  Subprocess = "Subprocess"
}
export enum BPMN_AssociationName {
  dataobject = "dataobjectOf_",
  attachedto = "attached to",
  sequenceflow = "Sequence Flow",
  messageflow = "Message Flow",
  association = "definitionOf"

}
export enum BPMN_AttributeTypeName {
  GatewayType = "GatewayType",
  EventType = "EventType",
  TriggerType = "TriggerType",
  TaskType = "TaskType",
  Instantiate = "Instantiate",
  Implementation = "Implementation",
  adhoc = "adhoc",
  //loop = "loop",
  Compensation = "Compensation",
  IntermediateType = "IntermediateType",
  SubProcessOrdering = "SubProcessOrdering",
  Script = "BpmnScript",
  refinement = "refinement",
  ConditionExpression = "ConditionExpression",
}

export enum BPMN_GatewayTypeName {
  XOR = "Exclusive Data",
  XORwM = "Exclusive Data (with Marker)",
  ExclusiveEvent = "Exclusive Event",
  Inclusive = "Inclusive",
  Parallel = "Parallel",
  Complex = "Complex",
  ExclusiveEventIns = "Exclusive Event (Instantiate)",
  ParallelEventIns = "Parallel Event (Instantiate)"
}

export enum BPMN_EventTypeName {
  Start = "Start",
  End = "End",
  Intermediate = "Intermediate"
}


// enumList: [{val: 'standard', dispName: 'Standard'}, 
// {val: 'eventInt', dispName: 'Interrupting'}, 
// {val: 'eventNonint', dispName: 'Non-Interrupting'}, 
// {val: 'catching', dispName: 'Catching'}, 
// {val: 'boundInt', dispName: 'Bound Interrupting'}, 
// {val: 'boundNonint', dispName: 'Bound Non-Interrupting'}, 
// {val: 'throwing', dispName: 'Throwing'}, 
// {val: 'end', dispName: 'End'}, 
// {val: 'none', dispName: 'None'}]

export enum BPMN_TriggerTypeName {
  None = "None",
  Message = "Message",
  Timer = "Timer",
  Error = "Error",
  Rule = "Rule",
  Signal = "Signal",
  Multiple = "Multiple",
  Cancel = "Cancel",
  Compensation = "Compensation",
  Link = "Link",
  Terminate = "Terminate",
  Escalation = "Escalation",
  ParallelMultiple = "Parallel Multiple"
}
export enum BPMN_TaskTypeName {
  None = "None",
  Service = "Service",
  Send = "Send",
  Receive = "Receive",
  User = "User",
  Manual = "Manual",
  Script = "Script",
  InstantiationReceive = "Instantiation Receive",
  BusinessRule = "Business Rule",
  Abstract = "Abstract",
  Event = "Event"
}

export enum BPMN_GatewayType {
  XOR = 0,
  XORwM = 1,
  ExclusiveEvent = 2,
  Inclusive = 3,
  Parallel = 4,
  Complex = 5,
  ExclusiveEventIns = 6,
  ParallelEventIns = 7
}

export enum BPMN_EventType {
  Start = 0,
  End = 2,
  Intermediate = 1
}
export enum BPMN_TriggerType {
  None = 0,
  Message = 1,
  Timer = 2,
  Error = 3,
  Rule = 4,
  Signal = 5,
  Multiple = 6,
  Cancel = 7,
  Compensation = 8,
  Link = 9,
  Terminate = 10,
  Escalation = 11,
  ParallelMultiple = 12
}
export enum BPMN_TaskType {
  None = 0,
  Service = 1,
  Send = 2,
  Receive = 3,
  User = 4,
  Manual = 5,
  Script = 6,
  InstantiationReceive = 7,
  BusinessRule = 8
}
export enum BPMN_ImplementationType {
  None = "",
  Service = "Web Service",
  Other = "Other"
}

export enum BPMN_EventIntermediateType {
  None = "",
  Catch = "Catch",
  Throw = "Throw"
}

export enum BPMN_SubprocessOrdering {
  None = "None",
  Loop = "Loop",
  Parallel = "Parallel",
  Sequential = "Sequential"
}


// export enum BPMN_OverlayPosition
// {
//   ALIGN_CENTER = 'center',
//   ALIGN_LEFT = 'left',
//   ALIGN_RIGHT = 'right',
//   ALIGN_TOP= 'top',
//   ALIGN_MIDDLE = 'middle',
//   ALIGN_BOTTOM = 'bottom'
// }
// export interface IBPMNElements {
//   GetAllTaskTypeNames(): BPMN_TaskTypeName [];
//   GetAllTriggerTypeNames(): BPMN_TriggerTypeName [];
//   GetAllEventTypeNames(): BPMN_EventTypeName [];
//   GetAllGatewayTypeNames(): BPMN_GatewayTypesName [];

//   GetTaskTypeName(type: BPMN_TaskType): BPMN_TaskTypeName;
//   GetEventTypeName(type: BPMN_EventType): BPMN_EventTypeName;
//   GetGatewayTypeName(type: BPMN_GatewayType): BPMN_GatewayTypesName;
//   GetTriggerTypeName(name: BPMN_TriggerType): BPMN_TriggerTypeName;

//   GetTaskType(name: BPMN_TaskTypeName): BPMN_TaskType;
//   GetEventType(name: BPMN_EventTypeName): BPMN_EventType;
//   GetGatewayType(name: BPMN_GatewayTypesName): BPMN_GatewayType;
//   GetTriggerType(name: BPMN_TriggerTypeName): BPMN_TriggerType;

//   CheckTaskType(TaskTypeValue: string): Boolean;
//   CheckGatewayType(GatewayTypeValue: string): Boolean;
//   CheckTriggerType(TriggerTypeValue: string): Boolean;
// }
