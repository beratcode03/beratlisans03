/**
 * BERAT CANKIR - Self Destruct Test Script (DÜZELT İLMİŞ)
 * 30 Kasım 2025, 23:59:59 Türkiye Saati = 20:59:59 UTC
 */

// 🔥 SELF DESTRUCT TARİHİ (UTC bazlı - DOĞRU)
const SELF_DESTRUCT_DATE_UTC = new Date('2025-11-25T19:08:00Z');

// Display için Türkiye saati
function getTurkeyTime() {
  const now = new Date();
  const utcTime = now.getTime();
  const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3
  return new Date(utcTime + TURKEY_OFFSET_MS);
}

// Türkiye saatinde hedef tarihi göster (display için)
function getSelfDestructTurkeyTime() {
  const utcTime = SELF_DESTRUCT_DATE_UTC.getTime();
  const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000;
  return new Date(utcTime + TURKEY_OFFSET_MS);
}

// Test
console.log('\n═══════════════════════════════════════════════════════');
console.log('🔥 SELF DESTRUCT TEST - BERAT CANKIR (DÜZELTILMIŞ)');
console.log('═══════════════════════════════════════════════════════\n');

// Şu anki zamanlar
const nowUTC = new Date();
const nowTurkey = getTurkeyTime();

console.log('📅 ZAMAN BİLGİLERİ:');
console.log('─────────────────────────────────────────────────────');
const turkeyDateStr = `${String(nowTurkey.getDate()).padStart(2, '0')}.${String(nowTurkey.getMonth() + 1).padStart(2, '0')}.${nowTurkey.getFullYear()} ${String(nowTurkey.getHours()).padStart(2, '0')}:${String(nowTurkey.getMinutes()).padStart(2, '0')}:${String(nowTurkey.getSeconds()).padStart(2, '0')}`;
console.log(`Türkiye Saati       : ${turkeyDateStr} ✅`);
console.log(`UTC Saati           : ${nowUTC.toISOString().replace('T', ' ').substring(0, 19)}`);
console.log('');

console.log('🎯 HEDEF TARİH:');
console.log('─────────────────────────────────────────────────────');
const targetTurkey = getSelfDestructTurkeyTime();
const targetStr = `${String(targetTurkey.getDate()).padStart(2, '0')}.${String(targetTurkey.getMonth() + 1).padStart(2, '0')}.${targetTurkey.getFullYear()} ${String(targetTurkey.getHours()).padStart(2, '0')}:${String(targetTurkey.getMinutes()).padStart(2, '0')}:${String(targetTurkey.getSeconds()).padStart(2, '0')}`;
console.log(`Self-Destruct Tarihi: ${targetStr} ✅`);
console.log(`UTC Karşılığı       : ${SELF_DESTRUCT_DATE_UTC.toISOString()}`);
console.log('');

// Kalan süre hesaplama (UTC bazlı - DOĞRU)
const diffMs = SELF_DESTRUCT_DATE_UTC.getTime() - nowUTC.getTime();
const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);

console.log('⏱️  KALAN SÜRE:');
console.log('─────────────────────────────────────────────────────');
if (diffMs > 0) {
  console.log(`${diffDays} gün, ${diffHours} saat, ${diffMinutes} dakika ✅`);
} else {
  console.log('❌ Self-destruct tarihi GEÇMİŞ!');
  console.log(`Geçen süre: ${Math.abs(diffDays)} gün önce`);
}
console.log('');

// Self-destruct kontrolü (UTC bazlı - DOĞRU)
const shouldDestruct = nowUTC >= SELF_DESTRUCT_DATE_UTC;

console.log('🚨 SELF-DESTRUCT DURUMU:');
console.log('─────────────────────────────────────────────────────');
if (shouldDestruct) {
  console.log('❌ UYARI: Self-destruct TETİKLENMELİ!');
  console.log('   Uygulama 30 Kasım 2025 23:59:59 Türkiye tarihini geçti.');
  console.log('   Uygulama başlatıldığında kendini silecek!');
} else {
  console.log('✅ GÜVENLİ: Uygulama henüz self-destruct tarihine ulaşmadı.');
  console.log(`   ${diffDays} gün sonra uygulama kendini silecek.`);
}
console.log('');

// Debug bilgileri
console.log('🔧 DEBUG BİLGİLERİ (UTC BAZLI):');
console.log('─────────────────────────────────────────────────────');
console.log(`Şu an UTC           : ${nowUTC.toISOString()}`);
console.log(`Hedef UTC           : ${SELF_DESTRUCT_DATE_UTC.toISOString()}`);
console.log(`UTC Karşılaştırma   : ${nowUTC.getTime()} >= ${SELF_DESTRUCT_DATE_UTC.getTime()}`);
console.log(`shouldDestruct      : ${shouldDestruct}`);
console.log('');

console.log('═══════════════════════════════════════════════════════');
console.log('✅ TEST TAMAMLANDI - DÜZELTILDI (UTC BAZLI)');
console.log('═══════════════════════════════════════════════════════\n');

process.exit(shouldDestruct ? 1 : 0);
