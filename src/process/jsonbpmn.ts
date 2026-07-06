import {
    ISemTalkAssociation, ISemTalkAssociationType, ISemTalkDiagram, ISemTalkInstance,
    ISemTalkObject, ISemTalkSystemClass, IObjectBase, SemTalkAttachment, SemTalkBaseConstant
} from "@semtalk/tbase";
import { BPMN_AssociationName, Process_ElementName } from "@semtalk/global";
import { BPMN_AttributeTypeName, BPMN_ElementName, BPMN_EventTypeName, BPMN_GatewayTypeName } from "./bpmninterface";
// import {
//     mxUtils,
//     mxGraphModel
// } from "mxgraph-js";
import { XMLParser } from "fast-xml-parser";
const LZUTF8 = require('lzutf8');

type JSONBPMNProcessID = string;
export type JSONBPMNProcess = {
    id: JSONBPMNProcessID;
    name: string;
    lanes: JSONBPMNLane[];
    elements: JSONBPMNElement[],
    flows: JSONBPMNFlow[],
    dataobjects: string[],
    layout: BPMNShape[],
    layout_flows: BPMNEdge[]
}

type JSONBPMNLaneID = string;
type JSONBPMNLane = {
    id: JSONBPMNLaneID;
    type: string;
    name: string;
    documentation?: string;
    attachments?: string[];
    attributes?: { [name: string]: any };
    elements: JSONBPMNElementID[];
}

type JSONBPMNElementID = string;
export enum JSONBPMNELEMENTTYPE {
    task = "task",
    callActivity = "callActivity",
    startEvent = "startEvent",
    endEvent = "endEvent",
    event = "event",
    boundaryEvent = "boundaryEvent",
    exclusiveGateway = "exclusiveGateway",
    inclusiveGateway = "inclusiveGateway",
    parallelGateway = "parallelGateway",
    gateway = "gateway",
    dataObject = "dataObject",
    subProcess = "subProcess"
}

type JSONBPMNFlowID = string;
type JSONBPMNFlow = {
    id: JSONBPMNFlowID;
    sourceRef: JSONBPMNElementID;
    targetRef: JSONBPMNElementID;
    condition?: string;
    attributes?: { [name: string]: any };
}

type JSONBPMNElement = {
    id: JSONBPMNElementID;
    type: JSONBPMNELEMENTTYPE
    name: string;
    documentation?: string;
    lane: JSONBPMNLaneID;
    attachments?: string[];
    attributes?: { [name: string]: any };
}

enum JSONBPMNTaskType {
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
    Event = "Event",
    Agentic = "Agentic"
}

type JSONBPMNTask = JSONBPMNElement & {
    calledProcess?: JSONBPMNProcessID;
    outputs?: JSONBPMNElementID[];
    inputs?: JSONBPMNElementID[];
    tasktype?: JSONBPMNTaskType
};

type JSONBPMNSubProcess = JSONBPMNTask & {
    elements?: JSONBPMNElement[]
};
enum JSONBPMNTriggerType {
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

type JSONBPMNEvent = JSONBPMNElement & {
    triggertype?: JSONBPMNTriggerType;
    attachedTo?: JSONBPMNElementID
};


type mxgraphstyle = string;
type JSONBPMNGeometry = {
    x: number,
    y: number,
    width: number,
    height: number
}
type JSONBPMNShapeID = string;
type BPMNShape = {
    id: JSONBPMNShapeID,
    elementid: JSONBPMNElementID,
    style: mxgraphstyle,
    bounds: JSONBPMNGeometry
}
type JSONBPMNWayPoint = {
    x: number,
    y: number
}
type BPMNEdge = {
    id: JSONBPMNShapeID,
    elementid: JSONBPMNFlowID,
    style: mxgraphstyle,
    waypoints: JSONBPMNWayPoint[]
}

function decodelzutf8(s: any): any {
    let ss = "";
    const compressedData = Buffer.from(s, 'base64');
    const decodedString = LZUTF8.decompress(compressedData, { inputEncoding: "Buffer" });

    ss = decodedString;

    // try {
    //   // const b = Buffer.from(s, 'base64');
    //   ss = lzutf8.decompress(s, { inputEncoding: "Base64" });
    // } catch {
    //   try {
    //     ss = base64.decode(s);
    //   } catch {
    //     ss = "";
    //   }
    // }
    return ss;
}
function getmxGraphXML(diag: ISemTalkDiagram): string {
    let xml = diag.ObjectBase.GetModelAttribute(
        diag.GetValue(SemTalkBaseConstant.SLMXGAttribute)
    );
    if (xml === undefined) xml = "";
    let decoded = decodelzutf8(xml);
    return decoded;
}

export function bpmnToJson(ob: IObjectBase, _diag: ISemTalkDiagram | null): { processes: JSONBPMNProcess[] } {

    let p = ob.FindDiagramType(ob.GetModelAttribute(Process_ElementName.SLProc));
    let systemclasses: { [name: string]: ISemTalkSystemClass } = {};
    try {
        systemclasses = {
            participant: ob.FindSystemClass(ob.GetModelAttribute(Process_ElementName.SLResource)) as ISemTalkSystemClass,
            event: ob.FindSystemClass(ob.GetModelAttribute(Process_ElementName.SLEvent)) as ISemTalkSystemClass,
            activity: ob.FindSystemClass(ob.GetModelAttribute(Process_ElementName.SLActivity)) as ISemTalkSystemClass,
            dataobject: ob.FindSystemClass(ob.GetModelAttribute(Process_ElementName.SLDataObject)) as ISemTalkSystemClass,
            gateway: ob.FindSystemClass(ob.GetModelAttribute(Process_ElementName.SLDecision)) as ISemTalkSystemClass,
            swimlane: ob.FindSystemClass(Process_ElementName.Swimlane) as ISemTalkSystemClass,
            controlflow: ob.FindAssociationType(ob.GetModelAttribute(Process_ElementName.SLControl)) as ISemTalkAssociationType,
            messageflow: ob.FindAssociationType(ob.GetModelAttribute(Process_ElementName.SLMessageFlow)) as ISemTalkAssociationType,
            dataobjectof: ob.FindAssociationType(BPMN_AssociationName.dataobject) as ISemTalkAssociationType,
            infotype: ob.FindAssociationType(ob.GetModelAttribute(Process_ElementName.SLInfoType)) as ISemTalkAssociationType,
            buffer: ob.FindSystemClass(ob.GetModelAttribute(Process_ElementName.SLBuffer)) as ISemTalkSystemClass,
            comment: ob.FindSystemClass(SemTalkBaseConstant.SLComment) as ISemTalkSystemClass,
            definitionof: ob.FindAssociationType(SemTalkBaseConstant.SLDefinitionOf) as ISemTalkAssociationType,
            displays: ob.FindAssociationType(SemTalkBaseConstant.SLDisplays) as ISemTalkAssociationType,
            uses: ob.FindAssociationType(ob.GetModelAttribute(Process_ElementName.SLUses)) as ISemTalkAssociationType,
            invuses: ob.FindAssociationType(ob.GetModelAttribute(Process_ElementName.SLInvUses)) as ISemTalkAssociationType,
            subprocess: ob.FindSystemClass(BPMN_ElementName.Subprocess) as ISemTalkSystemClass,
        };
    } catch (e: any) {
        console.log("Error finding system classes: " + e.message);
    }
    let procs: JSONBPMNProcess[] = [];
    if (!p) return { "processes": procs };

    for (let diag of p.AllInstances()) {
        let proc: JSONBPMNProcess = {
            id: diag.ID,
            name: diag.ObjectCaption,
            lanes: [],
            elements: [],
            flows: [],
            dataobjects: [],
            layout: [],
            layout_flows: []
        };

        let d = diag as ISemTalkDiagram;
        let xml = getmxGraphXML(d);

        let cells: any[] = [];
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "",
        });
        const doc = parser.parse(xml);
        // const node = doc.documentElement;
        const mxCells = doc.mxGraphModel?.root?.mxCell;
        cells = mxCells;

        // if (node !== null) {
        //     const model = new mxGraphModel();
        //     const codec = new mxCodec(node.ownerDocument);
        //     codec.decode(node, model);
        //     cells = model.cells;
        // }

        let swimlanenodes = d.Contents().filter(x => {
            let obj = x.Model;
            let ins = ob.IsInstance(obj);
            let sl = (obj as ISemTalkInstance).IsInstance(systemclasses.swimlane);
            return ins && sl;
        });
        swimlanenodes = swimlanenodes.filter(x => {
            let roles = x.Model.LinkedObjects(systemclasses.displays as ISemTalkAssociationType);
            return roles.length > 0
        });

        let lanes: JSONBPMNLane[] = swimlanenodes.map(x => {
            let roles = x.Model.LinkedObjects(systemclasses.displays as ISemTalkAssociationType);
            let r = roles[0] as ISemTalkInstance;
            let t: ISemTalkObject[] = [];
            let tinv: ISemTalkObject[] = [];
            if (systemclasses.uses) {
                t = r.InvLinkedObjects(systemclasses.uses as ISemTalkAssociationType);
            }
            if (systemclasses.invuses) {
                tinv = r.LinkedObjects(systemclasses.invuses as ISemTalkAssociationType);
            }
            t.push(...tinv)
            let elements = t.map(r => r.ID);
            let attr = r.Attributes();
            const attrobj: any = {};
            if (attr && attr.length > 0) {
                for (let a of attr) {
                    const name = a.ClassOf().ObjectName;
                    const val = a.Value;
                    attrobj[name] = val;
                };
            }
            return {
                id: r.ID, name: r.ObjectName, type: r.ClassOf().ObjectName,
                attributes: attrobj, elements: elements
            };
        });
        if (lanes && lanes.length > 0) {
            proc["lanes"] = lanes;
        }
        let elements: JSONBPMNElement[] = [];
        let dataobjects: string[] = [];
        let shapes: Record<JSONBPMNElementID, any[]> = {};
        for (let i in cells) {
            const shp = cells[i];
            const objid = shp.objectid;
            if (!shapes[objid]) {
                shapes[objid] = [shp];
            } else {
                shapes[objid].push(shp);
            }
        }
        for (let el of d.Contents()) {
            if (ob.IsInstance(el.Model)) {
                let inst = el.Model as ISemTalkInstance;
                let ishapes = shapes[inst.ID];
                if (ishapes) {
                    let onsubprocess = false;
                    for (let s of ishapes) {
                        if (s.parent.shapeKey && s.parent.shapeKey === "Subprocess") {
                            onsubprocess = true;
                        }
                    }
                    if (onsubprocess) {
                        continue;
                    }
                }
                let e = addElement(inst, proc, ishapes, shapes, systemclasses, dataobjects);
                if (e) elements.push(e);
            }
        }
        proc["elements"] = elements;
        if (dataobjects && dataobjects.length > 0) {
            proc["dataobjects"] = dataobjects;
        }
        procs.push(proc);
    }
    return { "processes": procs };
}

function addElement(inst: ISemTalkInstance, proc: JSONBPMNProcess, cells: any[], shapes: Record<JSONBPMNElementID, any[]>,
    systemclasses: { [name: string]: ISemTalkSystemClass }, dataobjects: string[]): JSONBPMNElement | null {
    let syscla = inst.SystemClass();
    let e: JSONBPMNElement | null = null;
    switch (syscla) {
        case systemclasses.activity: {
            e = makeTaskElement(inst, systemclasses, dataobjects);
            break;
        }
        case systemclasses.subprocess: {
            e = makeSubprocessElement(inst, proc, cells, shapes, systemclasses, dataobjects);
            break;
        }
        case systemclasses.event: {
            e = makeEventElement(inst, systemclasses, dataobjects);
            break;
        }
        case systemclasses.gateway: {
            e = makeGatewayElement(inst, systemclasses, dataobjects);
            break;
        }
        case systemclasses.dataobject: {
            e = makeDataObjectElement(inst, systemclasses, dataobjects);
            break;
        }
        default:
            break;
    }
    let iflows = inst.Links(systemclasses.controlflow as ISemTalkAssociationType);
    if (iflows && iflows.length > 0) {
        proc.flows.push(...iflows.map((f: ISemTalkAssociation) => {
            const fl: JSONBPMNFlow = {
                id: f.ID,
                sourceRef: f.FromObject.ID,
                targetRef: f.ToObject.ID
            };
            let c = f.GetValue(BPMN_AttributeTypeName.ConditionExpression);
            if (c) {
                fl.condition = c;
            }
            let attr = f.Attributes();
            if (attr && attr.length > 0) {
                const attrobj: any = {};
                for (let a of attr) {
                    const name = a.ClassOf().ObjectName;
                    const val = a.Value;
                    attrobj[name] = val;
                };
                fl["attributes"] = attrobj;
            }
            return fl;
        }));
    }
    let mflows = inst.Links(systemclasses.messageflow as ISemTalkAssociationType);
    if (mflows && mflows.length > 0) {
        proc.flows.push(...mflows.map((f: ISemTalkAssociation) => {
            const fl: JSONBPMNFlow = {
                id: f.ID,
                sourceRef: f.FromObject.ID,
                targetRef: f.ToObject.ID
            };
            return fl;
        }));
    }
    for (let nd of inst.Nodes()) {
        const shpid = nd.ShapeID;
        for (let i in cells) {
            const shp = cells[i];
            if (shp.shapeid === shpid) {
                if (shp && shp.mxGeometry) {
                    if (shp.vertex) {
                        let g = shp.mxGeometry;
                        proc.layout.push({
                            id: shpid, elementid: inst.ID,
                            style: shp.style,
                            bounds: {
                                x: g.x, y: g.y, width:
                                    g.width, height: g.height
                            }
                        });
                    } else {
                        proc.layout_flows.push({
                            id: shpid, elementid: inst.ID,
                            style: shp.style,
                            waypoints: []
                        });

                    }
                }
                break;
            }
        }
    }
    return e;
}
function makeTaskElement(inst: ISemTalkInstance, systemclasses: { [name: string]: ISemTalkSystemClass }, dataobjects: string[]): JSONBPMNTask {
    let e = createBPMNElement(inst) as JSONBPMNTask;
    e["type"] = JSONBPMNELEMENTTYPE.task;
    e["tasktype"] = inst.GetValue(BPMN_AttributeTypeName.TaskType)
    if (inst.Refinement) {
        e["calledProcess"] = inst.Refinement.ID;
    }

    let outs: string[] = [];
    for (let o of inst.LinkedObjects(systemclasses.controlflow as ISemTalkAssociationType)) {
        for (let info of o.LinkedObjects(systemclasses.infotype as ISemTalkAssociationType)) {
            outs.push(info.ObjectCaption);
            if (dataobjects.indexOf(info.ObjectCaption) < 0) {
                dataobjects.push(info.ObjectCaption);
            }
        }
    }
    for (let dao of inst.LinkedObjects(systemclasses.dataobjectof as ISemTalkAssociationType)) {
        for (let info of dao.LinkedObjects(systemclasses.infotype as ISemTalkAssociationType)) {
            outs.push(info.ObjectCaption);
            if (dataobjects.indexOf(info.ObjectCaption) < 0) {
                dataobjects.push(info.ObjectCaption);
            }
        }
    }
    if (outs && outs.length > 0) {
        e["outputs"] = outs;
    }
    let ins: string[] = [];
    for (let o of inst.InvLinkedObjects(systemclasses.controlflow as ISemTalkAssociationType)) {
        for (let info of o.LinkedObjects(systemclasses.infotype as ISemTalkAssociationType)) {
            ins.push(info.ObjectCaption);
            if (dataobjects.indexOf(info.ObjectCaption) < 0) {
                dataobjects.push(info.ObjectCaption);
            }
        }
    }
    for (let dao of inst.InvLinkedObjects(systemclasses.dataobjectof as ISemTalkAssociationType)) {
        for (let info of dao.LinkedObjects(systemclasses.infotype as ISemTalkAssociationType)) {
            ins.push(info.ObjectCaption);
            if (dataobjects.indexOf(info.ObjectCaption) < 0) {
                dataobjects.push(info.ObjectCaption);
            }
        }
    }
    if (ins && ins.length > 0) {
        e["inputs"] = ins;
    }
    return e;
}
function makeEventElement(inst: ISemTalkInstance, systemclasses: { [name: string]: ISemTalkSystemClass }, _dataobjects: string[]): JSONBPMNEvent {
    let e = createBPMNElement(inst) as JSONBPMNEvent;
    let eventtype = inst.GetValue(BPMN_AttributeTypeName.EventType);
    if (!eventtype) {
        let outputs = inst.LinkedObjects(systemclasses.controlflow as ISemTalkAssociationType);
        let inputs = inst.InvLinkedObjects(systemclasses.controlflow as ISemTalkAssociationType);
        if (inputs.length === 0 && outputs.length > 0) {
            eventtype = BPMN_EventTypeName.Start;
        }
        if (inputs.length > 0 && outputs.length === 0) {
            eventtype = BPMN_EventTypeName.End;
        }
    }
    switch (eventtype as BPMN_EventTypeName) {
        case BPMN_EventTypeName.Start: {
            e["type"] = JSONBPMNELEMENTTYPE.startEvent;
            break;
        }
        case BPMN_EventTypeName.Intermediate: {
            e["type"] = JSONBPMNELEMENTTYPE.event;
            let att = inst.LinkedObjects(BPMN_AssociationName.attachedto);
            if (att.length > 0) {
                let tsk = att[0];
                e["type"] = JSONBPMNELEMENTTYPE.boundaryEvent;
                e["attachedTo"] = tsk.ID;
            }
            break;
        }
        case BPMN_EventTypeName.End: {
            e["type"] = JSONBPMNELEMENTTYPE.endEvent;
            break;
        }
    }
    return e;
}
function makeGatewayElement(inst: ISemTalkInstance, _systemclasses: { [name: string]: ISemTalkSystemClass }, _dataobjects: string[]): JSONBPMNElement {
    let e = createBPMNElement(inst);
    let gatewaytype = inst.GetValue(BPMN_AttributeTypeName.GatewayType);
    switch (gatewaytype as BPMN_GatewayTypeName) {
        case BPMN_GatewayTypeName.XOR: {
            e["type"] = JSONBPMNELEMENTTYPE.exclusiveGateway;
            break;
        }
        case BPMN_GatewayTypeName.Inclusive: {
            e["type"] = JSONBPMNELEMENTTYPE.inclusiveGateway;
            break;
        }
        case BPMN_GatewayTypeName.Parallel: {
            e["type"] = JSONBPMNELEMENTTYPE.parallelGateway;
            break;
        }
        default: {
            e["type"] = JSONBPMNELEMENTTYPE.gateway;
        }
    }

    // let conditions: any = {};
    // for (let lnk of inst.LinkedObjects(systemclasses.controlflow as ISemTalkAssociationType)) {
    //     let cond = lnk.GetValue(BPMN_AttributeTypeName.ConditionExpression);
    //     if (cond && cond.length > 0) {
    //         conditions[cond] = (lnk as ISemTalkAssociation).ToObject.ID;
    //     }
    // }
    // if (Object.keys(conditions).length > 0) {
    //     e["conditions"] = conditions;
    // }
    return e;
}
function makeDataObjectElement(inst: ISemTalkInstance, systemclasses: { [name: string]: ISemTalkSystemClass }, dataobjects: string[]): JSONBPMNElement {
    let e = createBPMNElement(inst);
    e["type"] = JSONBPMNELEMENTTYPE.dataObject;
    for (let info of inst.LinkedObjects(systemclasses.infotype as ISemTalkAssociationType)) {
        e["name"] = info.ObjectCaption;
        if (dataobjects.indexOf(info.ObjectCaption) < 0) {
            dataobjects.push(info.ObjectCaption);
        }
    }
    return e;
}
function makeSubprocessElement(inst: ISemTalkInstance, proc: JSONBPMNProcess, cells: any[], shapes: Record<JSONBPMNElementID, any[]>, systemclasses: { [name: string]: ISemTalkSystemClass }, dataobjects: string[]): JSONBPMNSubProcess {
    let e = createBPMNElement(inst) as JSONBPMNSubProcess;
    e["type"] = JSONBPMNELEMENTTYPE.task;
    e["tasktype"] = inst.GetValue(BPMN_AttributeTypeName.TaskType)
    if (inst.Refinement) {
        e["calledProcess"] = inst.Refinement.ID;
    }

    let elements: JSONBPMNElement[] = [];
    for (let cell of cells) {
        for (let child of cell.children) {
            let objid = child.objectid;
            if (objid) {
                let cinst = inst.ObjectBase.FindInstanceByID(objid);
                if (cinst) {
                    let ishapes = shapes[inst.ID];
                    let ce = addElement(cinst, proc, ishapes, shapes, systemclasses, dataobjects);
                    if (ce) elements.push(ce);
                }
            }
        }
    }
    e["elements"] = elements;

    let outs: string[] = [];
    for (let o of inst.LinkedObjects(systemclasses.controlflow as ISemTalkAssociationType)) {
        for (let info of o.LinkedObjects(systemclasses.infotype as ISemTalkAssociationType)) {
            outs.push(info.ObjectCaption);
            if (dataobjects.indexOf(info.ObjectCaption) < 0) {
                dataobjects.push(info.ObjectCaption);
            }
        }
    }
    for (let dao of inst.LinkedObjects(systemclasses.dataobjectof as ISemTalkAssociationType)) {
        for (let info of dao.LinkedObjects(systemclasses.infotype as ISemTalkAssociationType)) {
            outs.push(info.ObjectCaption);
            if (dataobjects.indexOf(info.ObjectCaption) < 0) {
                dataobjects.push(info.ObjectCaption);
            }
        }
    }
    if (outs && outs.length > 0) {
        e["outputs"] = outs;
    }
    let ins: string[] = [];
    for (let o of inst.InvLinkedObjects(systemclasses.controlflow as ISemTalkAssociationType)) {
        for (let info of o.LinkedObjects(systemclasses.infotype as ISemTalkAssociationType)) {
            ins.push(info.ObjectCaption);
            if (dataobjects.indexOf(info.ObjectCaption) < 0) {
                dataobjects.push(info.ObjectCaption);
            }
        }
    }
    for (let dao of inst.InvLinkedObjects(systemclasses.dataobjectof as ISemTalkAssociationType)) {
        for (let info of dao.LinkedObjects(systemclasses.infotype as ISemTalkAssociationType)) {
            outs.push(info.ObjectCaption);
            if (dataobjects.indexOf(info.ObjectCaption) < 0) {
                dataobjects.push(info.ObjectCaption);
            }
        }
    }
    if (ins && ins.length > 0) {
        e["inputs"] = ins;
    }
    return e;
}
function createBPMNElement(inst: ISemTalkInstance): JSONBPMNElement {
    let e: any = {
        id: inst.ID,
        name: inst.ObjectCaption,
    };
    if (inst.Comment) e["documentation"] = inst.Comment;
    let att = inst.Attachments();
    if (att && att.length > 0) {
        let atts = att.map(a => {
            let url = a.ToObject.ObjectName;
            let lbl = a.ToObject.ObjectName;
            if (a.GetValue(SemTalkAttachment.label)) {
                lbl = a.GetValue(SemTalkAttachment.label);
            }
            return { name: lbl, url: url }
        });
        e["attachments"] = atts;
    }
    let attr = inst.Attributes();
    if (attr && attr.length > 0) {
        const attrobj: any = {};
        for (let a of attr) {
            const name = a.ClassOf().ObjectName;
            const val = a.Value;
            attrobj[name] = val;
        };
        e["attributes"] = attrobj;
    }
    // let next = inst.LinkedObjects(systemclasses.controlflow as ISemTalkAssociationType);
    // if (next && next.length > 0) {
    //     e["next"] = next.map(n => n.ID);
    // }
    // let prev = inst.InvLinkedObjects(systemclasses.controlflow as ISemTalkAssociationType);
    // if (prev && prev.length > 0) {
    //     e["previous"] = prev.map(n => n.ID);
    // }

    return e
}

export function jsonToBpmn(_ob: IObjectBase, _diag: ISemTalkDiagram | null, _modeljson: JSONBPMNProcess) {
}