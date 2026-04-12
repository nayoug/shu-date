/**
 * 静态资源版本化构建脚本
 * 用法: node build.js
 * 会自动给所有 CSS/JS/图片资源添加版本号查询参数
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.join(__dirname);
const VIEWS_DIR = path.join(ROOT_DIR, 'views');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const VERSION_FILE = path.join(ROOT_DIR, '.version.json');

// 读取版本号
function getVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

// 获取文件的 content hash（用于更精确的缓存）
function getFileHash(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(content).digest('hex').substring(0, 8);
  } catch {
    return '';
  }
}

// 需要版本化的资源类型
const RESOURCE_EXTENSIONS = ['.css', '.js', '.jpg', '.jpeg', '.png', '.svg', '.ico', '.webp', '.avif', '.gif'];

// 查找所有 EJS 文件
function findEjsFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findEjsFiles(fullPath));
    } else if (entry.name.endsWith('.ejs')) {
      files.push(fullPath);
    }
  }

  return files;
}

// 资源引用正则（匹配 href="/css/xxx.css" 或 src="/js/xxx.js" 等）
const RESOURCE_REGEX = /(?:href|src)=["']([^"']+\.(?:css|js|jpe?g|png|svg|ico|webp|avif|gif))["']/g;

// 更新单个文件中的资源引用
function updateResourceReferences(filePath, version) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let updated = false;
  let match;

  const newContent = content.replace(RESOURCE_REGEX, (fullMatch, resourcePath) => {
    // 排除已经有标准版本号格式的资源 (?v=数字.数字.数字)
    // 但允许替换临时 hack 如 ?v=bottom-right
    if (/^\?v=\d+\.\d+\.\d+/.test(resourcePath.split('?')[1])) {
      return fullMatch;
    }
    updated = true;
    // 移除现有的查询参数再添加新版本号
    const cleanPath = resourcePath.split('?')[0];
    return fullMatch.replace(resourcePath, `${cleanPath}?v=${version}`);
  });

  if (updated) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`  ✓ 已更新: ${path.relative(ROOT_DIR, filePath)}`);
    return true;
  }
  return false;
}

// 恢复原始引用（去掉版本号，用于下次构建前重置）
function resetResourceReferences(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let updated = false;

  const newContent = content.replace(RESOURCE_REGEX, (fullMatch, resourcePath) => {
    if (resourcePath.includes('?v=')) {
      updated = true;
      return fullMatch.replace(`?v=${VERSION}`, '').replace(resourcePath, resourcePath);
    }
    return fullMatch;
  });

  if (updated) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    return true;
  }
  return false;
}

// 主函数
function main() {
  const args = process.argv.slice(2);
  const version = getVersion();
  const VERSION = version; // 供 reset 使用

  console.log(`\n🔧 静态资源版本化构建`);
  console.log(`   版本: ${version}\n`);

  if (args.includes('--reset')) {
    console.log('📄 重置资源引用...\n');
    const ejsFiles = findEjsFiles(VIEWS_DIR);
    let count = 0;
    for (const file of ejsFiles) {
      if (resetResourceReferences(file)) count++;
    }
    console.log(`✓ 已重置 ${count} 个文件\n`);
    return;
  }

  // 构建版本化资源
  console.log('📄 更新资源引用...\n');
  const ejsFiles = findEjsFiles(VIEWS_DIR);
  let count = 0;
  for (const file of ejsFiles) {
    if (updateResourceReferences(file, version)) count++;
  }

  // 生成版本清单文件
  const manifest = {
    version,
    generatedAt: new Date().toISOString(),
    resources: {}
  };

  // 扫描 public 目录，生成资源 hash
  function scanPublicDir(dir, baseDir = dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanPublicDir(fullPath, baseDir);
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (RESOURCE_EXTENSIONS.includes(ext)) {
          const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
          const hash = getFileHash(fullPath);
          manifest.resources[relativePath] = {
            hash,
            version: `${version}-${hash}`
          };
        }
      }
    }
  }

  if (fs.existsSync(PUBLIC_DIR)) {
    scanPublicDir(PUBLIC_DIR);
  }

  fs.writeFileSync(VERSION_FILE, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`✓ 已生成版本清单: ${VERSION_FILE}`);

  console.log(`\n✓ 已更新 ${count} 个视图文件`);
  console.log(`\n✨ 构建完成！版本: ${version}\n`);
}

main();
