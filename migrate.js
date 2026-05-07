const Redis = require('ioredis');

// 配置连接
const upstash = new Redis(process.env.UPSTASH_URL, {
  maxRetriesPerRequest: 3,
  tls: process.env.UPSTASH_URL.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined
});

const newRedis = new Redis(process.env.NEW_REDIS_URL, {
  maxRetriesPerRequest: 3
});

upstash.on('error', (err) => console.error('❌ [Upstash] 报错:', err.message));
newRedis.on('error', (err) => console.error('❌ [新Redis] 报错:', err.message));

async function migrate() {
  console.log('🚀 准备开始跨版本纯文本迁移...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  let cursor = '0';
  let count = 0;
  
  try {
    do {
      // 每次扫描 100 个键
      const [newCursor, keys] = await upstash.scan(cursor, 'MATCH', '*', 'COUNT', 100);
      cursor = newCursor;
      
      for (const key of keys) {
        // 1. 获取纯文本值
        const value = await upstash.get(key);
        if (value === null) continue; // 如果刚好过期了就跳过

        // 2. 获取剩余过期时间（毫秒）
        const pttl = await upstash.pttl(key);
        
        // 3. 写入新数据库
        if (pttl > 0) {
          // 如果有过期时间，使用 PX 参数设置毫秒级过期
          await newRedis.set(key, value, 'PX', pttl);
        } else {
          // 如果是永久有效（pttl 为 -1），直接普通写入
          await newRedis.set(key, value);
        }
        
        count++;
      }
    } while (cursor !== '0');
    
    console.log(`🎉 纯文本迁移大功告成！完美搬运了 ${count} 条数据！`);
  } catch (err) {
    console.error('❌ 迁移中断:', err);
  } finally {
    upstash.quit();
    newRedis.quit();
    process.exit(0);
  }
}

migrate();
