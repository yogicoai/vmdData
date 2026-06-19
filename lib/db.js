import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'vmdData';

if (!uri) {
  // 빌드 타임엔 비어있을 수 있음. 런타임 호출 시점에 에러를 던지도록 지연 처리.
  console.warn('[db] MONGODB_URI 가 설정되지 않았습니다. .env.local 을 확인하세요.');
}

let clientPromise;

function getClientPromise() {
  if (!uri) throw new Error('MONGODB_URI 환경변수가 없습니다.');
  if (!global._vmdMongoClientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000, // DB 미연결 시 빠르게 실패
    });
    global._vmdMongoClientPromise = client.connect();
  }
  return global._vmdMongoClientPromise;
}

export async function getDb() {
  clientPromise = getClientPromise();
  const client = await clientPromise;
  return client.db(dbName);
}

export async function col(name) {
  const db = await getDb();
  return db.collection(name);
}

// 컬렉션 이름 상수
export const COL = {
  users: 'users',
  settlements: 'settlements',
  orders: 'orders',
  quotes: 'quotes',
  orderForms: 'orderForms',
};
