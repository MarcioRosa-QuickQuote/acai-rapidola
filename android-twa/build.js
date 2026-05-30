/**
 * Build script não-interativo para TWA usando @bubblewrap/core diretamente
 */
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);

const CORE = 'C:/Users/appqu/AppData/Roaming/npm/node_modules/@bubblewrap/cli/node_modules/@bubblewrap/core/dist/lib';

const { TwaManifest }     = require(CORE + '/TwaManifest');
const { TwaGenerator }    = require(CORE + '/TwaGenerator');
const { AndroidSdkTools } = require(CORE + '/androidSdk/AndroidSdkTools');
const { JdkHelper }       = require(CORE + '/jdk/JdkHelper');
const { Config }          = require(CORE + '/Config');
const { ConsoleLog }      = require(CORE + '/Log');

const JDK_PATH = 'C:/Program Files/Java/jdk-17';
const SDK_PATH = 'C:/Users/appqu/AppData/Local/Android/Sdk';
const KEYSTORE = path.join(__dirname, 'pedeacai.keystore');
const PROJECT_DIR = __dirname;

const ENV = {
  ...process.env,
  JAVA_HOME: JDK_PATH.replace(/\//g, '\\'),
  ANDROID_HOME: SDK_PATH.replace(/\//g, '\\'),
  ANDROID_SDK_ROOT: SDK_PATH.replace(/\//g, '\\'),
};

async function run(cmd, opts = {}) {
  console.log('  $', cmd.slice(0, 100));
  const { stdout, stderr } = await exec(cmd, { env: ENV, maxBuffer: 50 * 1024 * 1024, ...opts });
  if (stdout) process.stdout.write(stdout.slice(-1500));
  return stdout;
}

async function main() {
  console.log('\n🚀 Iniciando build TWA — Pé de Açaí\n');

  const log = new ConsoleLog('build');
  const config = new Config(JDK_PATH, SDK_PATH);
  const jdkHelper = new JdkHelper(process, config);

  // 1. Carrega manifesto
  const twaManifest = await TwaManifest.fromFile(path.join(PROJECT_DIR, 'twa-manifest.json'));
  console.log(`📦 Package: ${twaManifest.packageId}`);
  console.log(`🌐 Host: ${twaManifest.host}`);

  // 2. Verifica/instala build-tools
  const androidTools = await AndroidSdkTools.create(false, config, jdkHelper, log);
  try {
    await androidTools.checkBuildTools();
    console.log('✅ Build-tools já instalados');
  } catch {
    console.log('📥 Instalando Android build-tools...');
    await androidTools.installBuildTools();
  }

  // 3. Aceita licenças SDK
  const sdkmanager = path.join(SDK_PATH, 'tools/bin/sdkmanager').replace(/\//g, '\\');
  try {
    await run(`echo y | "${sdkmanager}" --licenses`, { shell: 'cmd.exe' });
  } catch { /* ignora erro de licença já aceita */ }

  // 4. Gera projeto Gradle
  console.log('\n📁 Gerando projeto Android (Gradle)...');
  const generator = new TwaGenerator();
  await generator.createTwaProject(PROJECT_DIR, twaManifest, log);
  console.log('✅ Projeto Gradle gerado');

  // 5. Build release
  const gradlew = path.join(PROJECT_DIR, 'gradlew.bat');
  console.log('\n🏗️  Compilando (assembleRelease)...');
  await run(`"${gradlew}" assembleRelease --stacktrace`, { cwd: PROJECT_DIR });

  // 6. Assina o APK com o keystore
  const apkUnsigned = path.join(PROJECT_DIR, 'app/build/outputs/apk/release/app-release-unsigned.apk');
  const apkSigned   = path.join(PROJECT_DIR, 'app-pedeacai-signed.apk');
  const apkFinal    = path.join(PROJECT_DIR, 'app-pedeacai.apk');

  const buildTools = path.join(SDK_PATH, 'build-tools/34.0.0').replace(/\//g, '\\');
  const apksigner  = path.join(buildTools, 'apksigner.bat');
  const zipalign   = path.join(buildTools, 'zipalign.exe');

  console.log('\n🔏 Assinando APK...');
  await run(
    `"${apksigner}" sign --ks "${KEYSTORE.replace(/\//g,'\\')}" --ks-alias pedeacai --ks-pass pass:pedeacai123 --key-pass pass:pedeacai123 --out "${apkSigned.replace(/\//g,'\\')}" "${apkUnsigned.replace(/\//g,'\\')}"`
  );

  console.log('📐 Alinhando APK (zipalign)...');
  await run(`"${zipalign}" -v 4 "${apkSigned.replace(/\//g,'\\')}" "${apkFinal.replace(/\//g,'\\')}"`);

  const size = (fs.statSync(apkFinal).size / 1024 / 1024).toFixed(1);
  console.log(`\n✅ APK pronto: ${apkFinal} (${size} MB)`);
  console.log('\n📋 Próximos passos:');
  console.log('  1. Crie conta no Google Play Console (play.google.com/console) — $25 único');
  console.log('  2. Crie novo app → upload do APK como "Internal Testing"');
  console.log('  3. Preencha ficha (descrição, screenshots, ícone 512px)');
  console.log('  4. Solicite revisão para produção\n');
}

main().catch(err => {
  console.error('\n❌ Erro no build:', err.message || err);
  if (err.stack) console.error(err.stack.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
});
