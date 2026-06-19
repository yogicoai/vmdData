// 초기 사용자 시드. 실행: npm run seed
// (.env.local 의 MONGODB_URI 사용 — Node 20+ 의 --env-file 로 로드)
import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'vmdData';
if (!uri) { console.error('MONGODB_URI 가 없습니다. (npm run seed 는 --env-file=.env.local 로 실행됩니다)'); process.exit(1); }

const USERS = [
  { username: 'yogico', password: '2026', role: 'admin' },
];

const client = new MongoClient(uri);
await client.connect();
const users = client.db(dbName).collection('users');
await users.createIndex({ username: 1 }, { unique: true });

for (const u of USERS) {
  const passwordHash = bcrypt.hashSync(u.password, 10);
  await users.updateOne(
    { username: u.username },
    { $set: { username: u.username, passwordHash, role: u.role }, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
  console.log(`✓ user "${u.username}" 준비됨 (role=${u.role})`);
}
await client.close();
console.log('시드 완료.');
