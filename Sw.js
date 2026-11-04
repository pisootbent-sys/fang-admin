// Service worker แบบเรียบง่าย: ไม่เก็บแคชข้อมูล (กันเห็นข้อมูลเก่า) ใช้เพื่อให้เบราว์เซอร์ติดตั้งเป็นแอปได้
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(){ /* ปล่อยให้เบราว์เซอร์โหลดจากเครือข่ายตามปกติ */ });
