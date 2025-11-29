/**
 * Config Encoder - Hassas yapılandırma verilerini şifreler
 * Bu script build sırasında çalıştırılır
 * BERAT CANKIR
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Şifreleme anahtarı - obfuscate edilecek
const ENCRYPTION_KEY = Buffer.from('QWZ5b25sdW1ZS1NBbmFsaXpTaXN0ZW1pMjAyNQ==', 'base64').toString('utf8').padEnd(32, '0').slice(0, 32);
const ALGORITHM = 'aes-256-cbc';

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
  try {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return null;
  }
}

function encodeConfigFile() {
  const inputPath = path.join(__dirname, 'config-initial-values.json');
  const outputPath = path.join(__dirname, 'config-initial-values.enc');
  const protectedOutputPath = path.join(__dirname, 'protected', 'config-initial-values.enc');
  
  if (!fs.existsSync(inputPath)) {
    console.error('config-initial-values.json bulunamadı!');
    return false;
  }
  
  try {
    const content = fs.readFileSync(inputPath, 'utf8');
    const encrypted = encrypt(content);
    
    // Ana klasöre kaydet
    fs.writeFileSync(outputPath, encrypted, 'utf8');
    console.log('Şifrelenmiş config oluşturuldu:', outputPath);
    
    // Protected klasöre de kaydet
    if (fs.existsSync(path.join(__dirname, 'protected'))) {
      fs.writeFileSync(protectedOutputPath, encrypted, 'utf8');
      console.log('Şifrelenmiş config kopyalandı:', protectedOutputPath);
    }
    
    return true;
  } catch (error) {
    console.error('Şifreleme hatası:', error);
    return false;
  }
}

// CLI modunda çalıştırıldığında
if (require.main === module) {
  encodeConfigFile();
}

module.exports = { encrypt, decrypt, encodeConfigFile };
