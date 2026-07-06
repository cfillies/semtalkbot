
import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import { createCipheriv, createDecipheriv } from 'crypto';
import { Document } from "@langchain/core/documents";
import { DocumentInterface } from '@langchain/core/documents';
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";


function encryptCipher(text: string) {
    const algorithm = 'aes-256-ctr';
    const secretKey = process.env.key ?? "00000000000000000000000000000000";
    const siv: string = process.env.iv ?? "00000000000000000000000000000000";
    // const iv = randomBytes(16);
    var cipher = createCipheriv(algorithm, secretKey, Buffer.from(siv, "hex"));

    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return encrypted.toString('hex');
}

function decryptDecipher(text: string) {
    const algorithm = 'aes-256-ctr';
    const secretKey = process.env.key ?? "00000000000000000000000000000000";
    const siv: string = process.env.iv ?? "00000000000000000000000000000000";
    var decipher = createDecipheriv(algorithm, secretKey, Buffer.from(siv, "hex"));
    var dec = decipher.update(text, 'hex', 'utf8')
    dec += decipher.final('utf8');
    return dec;
}
// let defaultcon = JSON.stringify({
//     "connect": process.env.CONNECTION_STRING,
//     // "database": process.env.DBName
// });

export function encode(connection: string, database: string): string {
    let con = JSON.stringify({
        "connect": connection,
        // "database": database
    });
    return encryptCipher(con);
}

export const connect = async (connect_token?: string): Promise<MongoClient> => {
    let mongoUrl = process.env.CONNECTION_STRING ?? "";

    if (connect_token && connect_token.length > 0) {
        if (connect_token.startsWith("mongodb")) {
            mongoUrl = connect_token;
        } else {
            try {
                const ts = JSON.parse(decryptDecipher(connect_token));
                mongoUrl = ts["connect"] ?? mongoUrl;
                // dbname = ts["database"];
            } catch (e) {
                console.log(e);
            }
        }
    }

    if (!mongoUrl) {
        throw new Error("MongoDB connection string is missing.");
    }

    try {
        mongoUrl = mongoUrl.replace("localhost", "127.0.0.1");
        return await MongoClient.connect(mongoUrl);
    } catch (e) {
        console.debug(e);
        throw e;
    }
}
export async function clone(database: string, collection: string, destcollection: string, desturl: string, token?: any): Promise<any> {
    try {
        let dbname = database;
        let client = await connect(token);
        if (client) {
            let db: Db = client.db(dbname);
            let coll: Collection = db.collection(collection);
            let result = await coll.find({});
            let res = await result.toArray();
            client.close();
            let client2 = await MongoClient.connect(desturl);
            let db2 = client2.db(dbname);
            let coll2 = db2.collection(destcollection);
            coll2.drop();
            let result2: any = await coll2.insertMany(res);
            let res2 = await result2.result;
            client2.close();
            return res2;
        }
    }
    catch (err) { console.error(err); }
}

export async function clonedb(database: string, desturl: string, destdbname: string, token?: any): Promise<any> {
    try {
        let mongoUrl = process.env.CONNECTION_STRING;
        if (token) {
            let ts = JSON.parse(decryptDecipher(token));
            mongoUrl = ts["connect"];
            // dbname = ts["database"]
        }
        if (mongoUrl) {
            let client = await MongoClient.connect(mongoUrl);
            // let client = await connect(token);
            let dbname = database;
            let db = client.db(dbname);

            if (desturl == undefined && destdbname == undefined) {
                throw new Error("server or dbname need to be different!");
            }

            if (desturl == undefined) {
                desturl = mongoUrl;
            }

            if (destdbname == undefined) {
                destdbname = dbname;
            }
            let client2 = await MongoClient.connect(desturl);
            let db2: Db = client2.db(destdbname);

            const cols = await db.listCollections().toArray();
            let results: any[] = [];
            for (let c of cols) {
                let cname = c.name;
                let coll = db.collection(cname);
                let result = await coll.find({});
                let res = await result.toArray();
                let coll2 = db2.collection(cname);
                try {
                    coll2.drop();
                } catch (e) {

                }
                if (res.length > 0) {
                    await coll2.insertMany(res);
                    results.push(cname);
                } else {
                    await db2.createCollection(cname);
                    results.push(cname);
                }
            }
            client.close();
            client2.close();
            return results;
        }
    }
    catch (err) { console.error(err); }
}

export async function getvalue(database: string, collection: string, name: any, attr: string, token?: any): Promise<any> {
    try {
        // let mongoUrl = process.env.CONNECTION_STRING;
        // if (token) {
        //     let ts = JSON.parse(decryptDecipher(token));
        //     mongoUrl = ts["connect"];
        // }
        // client = await MongoClient.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });
        let client = await connect(token);
        if (client) {
            let dbname = database;
            let db = client.db(dbname);
            let coll = db.collection(collection);
            attr = decodeURIComponent(attr);
            let project: any = {};
            project[attr] = 1;
            name = decodeURIComponent(name);
            let result = await coll.find({ "name": name }, { projection: project });
            let ar: any[] = await result.toArray();
            if (ar.length == 0) {
                try {
                    const filter = { "_id": new ObjectId(name) };
                    const res1 = await coll.findOne(filter, { projection: project });
                    if (res1) {
                        ar.push(res1);
                    }
                } catch (e) {
                }
            }
            // let res: any;
            // if (ar.length > 0) {
            //     let item = ar[0];
            //     res = item[attr];
            // }
            client.close();
            if (ar.length > 0) {
                return ar[0][attr];
            }
        }
        return null;
    }
    catch (err) { console.error(err); }
}

export async function getCollectionItems(database: string, token?: any): Promise<any> {
    try {
        let client = await connect(token);
        if (client) {
            let dbname = database;
            let db = client.db(dbname);
            let coll = await db.listCollections().toArray();
            let res = coll;
            client.close();
            return res;
        }
    }
    catch (err) { console.error(err); }
}

export async function setvalue(database: string, collection: string, name: any, attr: string, value: any, token?: any): Promise<any> {
    try {
        let client = await connect(token);
        if (client) {
            let dbname = database;
            let db = client.db(dbname);
            let coll = db.collection(collection);
            attr = decodeURIComponent(attr);
            let v: any = {};
            v[attr] = value;
            name = decodeURIComponent(name);

            let result = await coll.updateOne({ "name": name }, { $set: v });
            if (result.matchedCount == 0) {
                try {
                    result = await coll.updateOne({ "_id": new ObjectId(name) }, { $set: v });
                } catch (e) {
                }
            }
            let res = result;
            client.close();
            return res;
        }
    }
    catch (err) { console.error(err); }
}
// export async function setvaluebyid(database: string, collection: string, name: any, attr: string, value: any, token?: any): Promise<any> {
//     try {
//         let client = await connect(token);
//         let dbname = database;
//         let db = client.db(dbname);
//         let coll = db.collection(collection);
//         let v = {};
//         v[attr] = value;
//         let result = await coll.updateOne({ "_id": new ObjectId(name) }, { $set: v });
//         let res = result.result;
//         client.close();
//         return res;
//     }
//     catch (err) { console.error(err); }
// }

export async function deleteMany(database: string, collection: string, token: any) {
    try {
        let client = await connect(token);
        if (client) {
            let dbname = database;
            let db = client.db(dbname);
            const indexcoll = db.collection(collection);
            await indexcoll.deleteMany({});
            client.close();
        }
    } catch (err) { console.error(err); }
}
export async function createMongoDBSearchIndex(database: string, indexcollection: string, field: string, connect_token: any,
    documents: Document[], embeddings: any): Promise<any> {
    try {
        let client = await connect(connect_token);
        let dbname = database;
        let db = client.db(dbname);
        const indexcoll = db.collection(indexcollection);
        await indexcoll.deleteMany({});

        // const vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddings);
        const vectorStore = await MongoDBAtlasVectorSearch.fromDocuments(documents, embeddings,
            {
                collection: indexcoll,
                indexName: "embedding",
                textKey: field,
                embeddingKey: "embedding"
            });
        // console.log(vectorStore);
        client.close();
        return vectorStore;
    } catch (err) { console.error(err); }
}
export async function mongoDBVectorSearch(database: string, indexcollection: string, token: any,
    embeddings: any, query: string, filter: any, k: number): Promise<[DocumentInterface<Record<string, any>>, number][]> {
    let client = await connect(token);
    let dbname = database;
    let db = client.db(dbname);
    const indexcoll = db.collection(indexcollection);

    // const vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddings);
    const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
        collection: indexcoll,
        indexName: "embedding",
        textKey: "text",
        embeddingKey: "embedding",
    });
    // const filter = {
    //     preFilter: {
    //         sourcetype: {
    //             $eq: "Generic",
    //         },
    //     },
    // }
    // similaritySearch
    const res = await vectorStore.similaritySearchWithScore(query, k, filter);
    client.close();
    return res;

    // const retriever = vectorStore.asRetriever(10);
    // let relevantdocs = await retriever.getRelevantDocuments(query);
    // client.close();
    // return relevantdocs
}

export async function unsetvalue(database: string, collection: string, name: any, attr: string, token?: any): Promise<any> {
    try {
        let client = await connect(token);
        let dbname = database;
        let db = client.db(dbname);
        let coll = db.collection(collection);
        attr = decodeURIComponent(attr);
        let v: Record<string, string> = {};
        v[attr] = "";
        if (name) {
            name = decodeURIComponent(name);
        }
        let result = await coll.updateOne({ "name": name }, { $unset: v });
        if (result.matchedCount == 0) {
            try {
                result = await coll.updateOne({ "_id": new ObjectId(name) }, { $unset: v });
            } catch (e) {
            }
        }
        let res = result;
        client.close();
        return res;
    }
    catch (err) { console.error(err); }
}
// export async function unsetvaluebyid(database: string, collection: string, name: any, attr: string, token?: any): Promise<any> {
//     try {
//         let client = await connect(token);
//         let dbname = database;
//         let db = client.db(dbname);
//         let coll = db.collection(collection);
//         let v = {};
//         v[attr] = "";
//         let result = await coll.updateOne({ "_id": new ObjectId(name) }, { $unset: v });
//         let res = result.result;
//         client.close();
//         return res;
//     }
//     catch (err) { console.error(err); }
// }
export async function find(database: string, collection: string, filter: any, token?: any): Promise<any[]> {
    try {
        let client = await connect(token);
        let dbname = database;
        let db = client.db(dbname);
        let coll = db.collection(collection);
        if (filter == undefined) {
            filter = {};
        } else {
            delete filter["token"];
            delete filter["database"];
            delete filter["collection"];
        }
        if (filter["name"] == '*') {
            delete filter["name"];
        }
        if (filter["name"]) {
            filter["name"] = decodeURIComponent(filter["name"]);
        }
        let result = await coll.find(filter);
        let res: any[] = [];
        res = await result.toArray();
        if (res.length == 0) {
            let v = filter["name"];
            delete filter["name"];
            try {
                filter["_id"] = new ObjectId(v);
                const res1 = await coll.findOne(filter);
                res.push(res1);
            } catch (e) { };
        }
        client.close();
        return res;
    }
    catch (err) {
        console.error(err);
        return [];
    }
}

export async function getMongoClient(token?: any): Promise<MongoClient> {
    let client = await connect(token);
    return client
}
export async function findOneById(client: MongoClient, database: string, collection: string, filter: any): Promise<any> {
    try {
        let dbname = database;
        let db = client.db(dbname);
        let coll = db.collection(collection);
        const res = await coll.findOne(filter);
        // client.close();
        return res;
    }
    catch (err) { console.error(err); }
}
export async function findMetaData(database: string, collection: string, filter: any,
    project: any, token?: any): Promise<any> {
    try {
        let client = await connect(token);
        let dbname = database;
        let db = client.db(dbname);
        let coll = db.collection(collection);
        if (filter == undefined) {
            filter = {};
        } else {
            delete filter["token"];
            delete filter["database"];
            delete filter["collection"];
            delete filter["project"];
        }
        if (filter["name"] == '*') {
            delete filter["name"];
        }
        let result = await coll.find(filter).project(project);
        let res = await result.toArray();
        if (res.length == 0) {
            try {
                let v = filter["name"];
                delete filter["name"];
                filter["_id"] = new ObjectId(v);
                const res1 = await coll.findOne(filter);
                if (res1) {
                    res.push(res1);
                }
            } catch (e) { };
        }
        client.close();
        // res = res.map((v) => {
        //     delete v["value"];
        //     delete v["zip"];
        //     return v;
        // });
        return res;
    }
    catch (err) { console.error(err); }
}
export async function rename(database: string, collection: string, name: string, value: any, token?: any): Promise<any> {
    try {
        let client = await connect(token);
        let dbname = database;
        let db = client.db(dbname);
        let coll = db.collection(collection);

        let result = await coll.updateOne({ "name": name }, { $set: { "name": value } });
        if (result.matchedCount == 0) {
            try {
                result = await coll.updateOne({ "_id": new ObjectId(name) }, { $set: { "name": value } });
            } catch (e) {
            }
        }
        let res = result;
        client.close();
        return res;
    }
    catch (err) { console.error(err); }
}
export async function save(database: string, collection: string, name: string, value: any, token?: any): Promise<any> {
    // try {
    let client = await connect(token);
    let dbname = database;
    let db = client.db(dbname);
    let coll = db.collection(collection);
    if (name) {
        name = decodeURIComponent(name);
    }
    // let result = await coll.updateOne({ "name": name }, { $set: { "value": value } }, { "upsert": true });
    if (value["_id"]) {
        delete value["_id"]
    }
    let result = await coll.updateOne({ "name": name }, { $set: value }, { "upsert": true });
    let res = await result;
    client.close();
    return res;
    // }
    // catch (err) { console.error(err); }
}
export async function insert(database: string, collection: string, values: any[], token?: any): Promise<any> {
    // try {
    let client = await connect(token);
    let dbname = database;
    let db = client.db(dbname);
    let coll = db.collection(collection);
    for (let v of values) {
        if (v["_id"]) {
            // ObjectId akzeptiert nur 24 zeichen. SemTalkID sind 36 Zeichen
            // let id = v["_id"];
            // v["_id"] = new ObjectId(id);
            delete v["_id"]
        }
    }
    let result = await coll.insertMany(values);
    let res = await result;
    client.close();
    return res;
    // }
    // catch (err) { console.error(err); }
}
export async function update(database: string, collection: string, match: any, value: any, token?: any): Promise<any> {
    // try {
    let client = await connect(token);
    let dbname = database;
    let db = client.db(dbname);
    let coll = db.collection(collection);
    if (match == undefined) {
        match = {};
    }
    if (match["name"] == '*') {
        delete match["name"];
    }
    let id = value["_id"];
    if (id && match["name"] && (match["name"] as string).indexOf("%2F") > 0) {
        delete match["name"];
        match["_id"] = new ObjectId(value["_id"]);
    } else {
        if (match["name"]) {
            let n = decodeURIComponent(match["name"]);
            match["name"] = n;
        }
    }
    if (value["_id"]) {
        delete value["_id"];
    }

    let result = await coll.updateOne(match, { $set: value }, { "upsert": true });
    let res = await result;
    client.close();
    return res;
    // }
    // catch (err) { console.error(err); }
}
export async function deletedocument(database: string, collection: string, filter: any, token?: any): Promise<any> {
    try {
        let client = await connect(token);
        let dbname = database;
        let db = client.db(dbname);
        await backup(db, collection, filter);
        let coll = db.collection(collection);
        if (filter == undefined) {
            filter = {};
        } else {
            delete filter["token"];
            delete filter["database"];
            delete filter["collection"];
        }
        if (filter["name"]) {
            filter["name"] = decodeURIComponent(filter["name"]);
        }
        if (filter["name"] == '*') {
            delete filter["name"];
        }
        let result = await coll.deleteMany(filter);
        if (result.deletedCount == 0) {
            let v = filter["name"];
            delete filter["name"];
            try {
                filter["_id"] = new ObjectId(v);
                result = await coll.deleteOne(filter);
            } catch (e) { };
        }
        let res = await result;
        client.close();
        return res;
    }
    catch (err) { console.error(err); }
}

async function backup(db: Db, collection: string, filter: any): Promise<any> {
    let coll = db.collection(collection);
    let recbin = db.collection("recycle_bin");
    if (filter == undefined) {
        filter = {};
    } else {
        delete filter["token"];
        delete filter["database"];
        delete filter["collection"];
    }
    if (filter["name"] == '*') {
        delete filter["name"];
    }
    let res = await coll.find(filter);
    let docs = await res.toArray();
    for (let doc of docs) {
        let n = doc["name"];
        let d = new Date();
        // let v = doc["value"];
        await recbin.insertOne({ "name": n, "deleted": d.toUTCString(), "value": doc });
    }
    return docs;
}
export async function backupdocument(database: string, collection: string, filter: any, token?: any): Promise<any> {
    try {
        let client = await connect(token);
        let dbname = database;
        let db = client.db(dbname);
        let docs = await backup(db, collection, filter);
        client.close();
        return docs;
    }
    catch (err) { console.error(err); }
}
export async function deletecollection(database: string, collection: string, token?: any): Promise<any> {
    try {
        let client = await connect(token);
        let dbname = database;
        let db = client.db(dbname);
        let coll = db.collection(collection);
        let result = await coll.drop();
        let res = await result;
        client.close();
        return res;
    }
    catch (err) { console.error(err); }
}
export async function findNames(database: string, collection: string, filter: any, token: any): Promise<any> {
    try {
        let client = await connect(token);
        let dbname = database;
        let db = client.db(dbname);
        let coll = db.collection(collection);
        if (filter == undefined) {
            filter = {};
        } else {
            delete filter["token"];
            delete filter["database"];
            delete filter["collection"];
        }
        let result = await coll.find(filter, {
            projection: { name: 1 }
        });
        let res = await result.toArray();
        client.close();
        return res;
    }
    catch (err) { console.error(err); }
}
export async function listdatabases(database: string, issemtalk: string, token?: any): Promise<any> {
    try {
        let client = await connect(token);
        let dbname = database;
        let db = client.db(dbname);
        let adminDb = db.admin();
        // List all the available databases
        let result = await adminDb.listDatabases();
        let dblist = [];
        for (let db2 of result.databases) {
            let dbname2 = db2["name"];
            if (dbname2 !== "admin" && dbname2 !== "config" && dbname2 !== "local") {
                if (issemtalk && issemtalk.length > 0) {
                    let db3 = client.db(dbname2);
                    const collections = await db3.listCollections({ name: issemtalk }).toArray();
                    if (collections.length === 1) {
                        dblist.push(dbname2);
                    }
                } else {
                    dblist.push(dbname2);
                }
            }
        }
        client.close();
        return dblist;
    }
    catch (err) { console.error(err); }
}

