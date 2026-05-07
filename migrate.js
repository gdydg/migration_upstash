const Redis = require('ioredis');

const upstash = new Redis(process.env.UPSTASH_URL);
const newRedis = new Redis(process.env.NEW_REDIS_URL);

async function migrate() {
  console.log('🚀 开始从 Upstash 迁移数据...');
  let cursor = '0';
  let count = 0;
  try {
    do {
      const [newCursor, keys] = await upstash.scan(cursor, 'MATCH', '*', 'COUNT', 100);
      cursor = newCursor;
      for (const key of keys) {
        const dumpData = await upstash.dump(key);
        const pttl = await upstash.pttl(key);
        const ttl = pttl > 0 ? pttl : 0;
        await newRedis.restore(key, ttl, dumpData, 'REPLACE');
        count++;
      }
    } while (cursor !== '0');
    console.log(`🎉 完美迁移了 ${count} 条数据！`);
  } catch (err) {
    console.error('❌ 迁移错误:', err);
  } finally {
    upstash.quit();
    newRedis.quit();
    process.exit(0);
  }
}
migrate();
