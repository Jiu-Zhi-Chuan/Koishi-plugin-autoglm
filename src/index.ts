import { Context, h, Schema } from 'koishi'

// 使用相对路径导入本目录下的 pythonBridge
import { runOpenAutoGLM } from './pythonBridge'
import { config } from 'process';

const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

export const name = 'autoglm'

export const usage = `# <center>万物皆可Bot - AutoGLM 控制手机！</center>

### 更新进度
- 12.16-2025 - 初版发布 目前支持有线ADB连接手机并安装ADB Keyboard应用

## 插件起源
- 事情还要从某天说起，那天我闲着无聊打开了B站就看到了一个视频，视频如下，我在想都可以写成这样了，为什么不让Bot来帮我操控手机呢？于是就有了这个插件的诞生。我的文档看你写出来教程不是很明细，你们需要也可以看看下面的视频[自语：虽然也不知道能干啥用吧，但是写出来总归是好事情嘛~]
<iframe src="//player.bilibili.com/player.html?isOutside=true&aid=115715696757292&bvid=BV1fUmYByEWH&cid=34726545956&p=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>

### 项目所需文件
- 下载链接：https://wwant.lanzouu.com/b0187zv6kf [密码:4i7r] 含requirements.txt和所有必要文件

### 电脑端配置
- [ ] Node.js 环境就不说了，肯定有安装不然也见不到我的插件了
- [ ] 电脑已安装 ADB 工具并且配置好环境变量(下载地址：https://googledownloads.cn/android/repository/platform-tools-latest-windows.zip)
- [ ] 电脑已安装 Python 3.8+ (下载地址：https://www.python.org/downloads/)
- [ ] 电脑已安装所需 Python 依赖 (见下方「安装依赖」部分) 
- [ ] \`pip install -r requirements.txt && pip install -e .\` 安装依赖

### 硬件环境
- [ ] 用户有一台安卓手机(Android 7.0+)
- [ ] 用户有一根支持数据传输的 USB 数据线(不是仅充电线)
- [ ] 手机和电脑可以通过数据线连接

### 手机端配置
- [ ] 手机已开启「开发者模式」(设置 → 关于手机 → 连续点击版本号 7 次)
- [ ] 手机已开启「USB 调试」(设置 → 开发者选项 → USB 调试)
- [ ] 部分机型需要同时开启「USB 调试(安全设置)」
- [ ] 手机已安装 ADB Keyboard 应用(下载地址：https://github.com/senzhk/ADBKeyBoard/blob/master/ADBKeyboard.apk)
- [ ] ADB Keyboard 已在系统设置中启用(设置 → 语言和输入法 → 启用 ADB Keyboard)

#### 🙏 致谢
- [Koishi](https://koishi.chat/) - 机器人框架
- [Open-AutoGLM](https://github.com/zai-org/Open-AutoGLM?tab=readme-ov-file) - Open-AutoGLM

## 📄 License

MIT License © 2025`;

export interface Config { }

export const Config: Schema<Config> = Schema.object({
  groupRelation: Schema.object({
    master: Schema.string().description('触发QQ').default('').required(),
    url: Schema.string().description('API 地址\n\n智谱地址：https://open.bigmodel.cn/api/paas/v4\n\n魔搭地址：https://api-inference.modelscope.cn/v1')
      .default('').required(),
    model: Schema.string().description('模型名称\n\n智谱模型：autoglm-phone\n\n魔搭模型：ZhipuAI/AutoGLM-Phone-9B')
      .default('').required(),
    apikey: Schema.string().description('API Key\n\n智谱APIKEY：https://open.bigmodel.cn 注册后获取\n\n魔搭APIKEY：https://modelscope.cn/my/myaccesstoken 注册后获取\n\n注意：魔搭免费用户每天有调用次数限制，建议使用智谱,魔搭的需要绑定阿里云后才可以正常使用')
      .default('').required(),
  })
    .description('配置表')
})
/**
 * 整合版：同步检测ADB设备连接 + ADB Keyboard安装状态 + 自动安装 + 自动启用输入法（全程return输出）
 * @returns {string} 所有检测/安装/启用的结果信息
 */
function checkADBDevices() {
  // 第一步：执行adb devices检测设备连接（同步）
  try {
    const stdout = execSync('adb devices', { encoding: 'utf8' });

    // 解析设备连接状态
    const lines = stdout.split('\n').map(line => line.trim()).filter(line => line);
    const deviceLines = lines.filter(line => !line.includes('List of devices attached'));
    let connectedDeviceId = null;
    let isDeviceConnected = false;

    for (const line of deviceLines) {
      const [deviceId, status] = line.split('\t');
      if (status === 'device' && deviceId) {
        connectedDeviceId = deviceId.trim();
        isDeviceConnected = true;
        break;
      }
    }

    // 设备未连接，直接return结果
    if (!isDeviceConnected) {
      return '❌ 未检测到已连接的ADB设备';
    }

    // 设备已连接，拼接设备信息，再检测应用安装状态
    const deviceMsg = `✅ 设备连接成功，设备ID：${connectedDeviceId}`;
    const appMsg = checkADBKeyboardInstalled(connectedDeviceId);
    return `${deviceMsg}\n${appMsg}`;

  } catch (error) {
    // 捕获adb devices命令执行失败的错误，return错误信息
    return `执行出错：${error.message}`;
  }

  // **************************
  // 内部辅助函数：检测应用安装状态 + 自动安装 + 安装后自动启用（同步）
  // **************************
  function checkADBKeyboardInstalled(deviceId) {
    try {
      const filterCmd = process.platform === 'win32' ? 'findstr' : 'grep';
      const checkCmd = `adb -s ${deviceId} shell pm list packages | ${filterCmd} "com.android.adbkeyboard"`;

      // 同步执行命令（未找到结果时会抛出错误，在catch中处理）
      const stdout = execSync(checkCmd, { encoding: 'utf8' });

      // 有输出表示已安装，直接检测是否启用，未启用则自动启用
      if (stdout.trim()) {
        const enableMsg = enableAdbIme(deviceId);
        console.log(enableMsg)
        return `✅ 设备已安装ADB键盘\n${enableMsg}`;
      } else {
        // 未安装，执行自动安装并返回安装+启用结果
        const installMsg = installAPK(deviceId);
        return `❌ 设备未安装ADB键盘，正在尝试自动安装...\n${installMsg}`;
      }

    } catch (error) {
      // 区分错误类型：status=1是“未找到匹配项”（正常），其他是真错误
      if (error.status === 1) {
        // 未安装，执行自动安装并返回安装+启用结果
        const installMsg = installAPK(deviceId);
        return `❌ 设备未安装ADB键盘，正在尝试自动安装...\n${installMsg}`;
      } else {
        return `❌ 检测应用安装状态失败：${error.message}`;
      }
    }
  }

  /**
   * 安装ADB Keyboard APK
   * @param {string} deviceId 设备ID
   * @returns {string} 安装结果 + 启用结果
   */
  function installAPK(deviceId) {
    // 1. 验证设备ID
    if (!deviceId) {
      return '❌ 未检测到已连接的ADB设备';
    }

    // 2. 验证APK文件是否存在（使用__dirname定位到当前脚本目录的ADBKeyboard.apk）
    const absApkPath = path.resolve(__dirname, 'ADBKeyboard.apk');
    if (!fs.existsSync(absApkPath)) {
      return `❌ APK文件不存在：${absApkPath}`;
    }

    // 3. 同步执行安装命令
    try {
      const installCmd = `adb -s ${deviceId} install -r "${absApkPath}"`;
      const stdout = execSync(installCmd, { encoding: 'utf8' });

      if (stdout.includes('Success')) {
        // 安装成功后，执行自动启用输入法
        const enableMsg = enableAdbIme(deviceId);
        console.log(enableMsg)
        return `✅ 安装成功！\n${enableMsg}`;
      } else {
        return `⚠️ 安装完成，输出：${stdout.trim()}`;
      }
    } catch (error) {
      return `❌ 安装失败：${error.message}`;
    }
  }

  /**
   * 启用ADB Keyboard输入法
   * @param {string} deviceId 设备ID
   * @returns {string} 启用结果
   */
  function enableAdbIme(deviceId) {
    const imeId = 'com.android.adbkeyboard/.AdbIME';
    try {
      // 执行启用输入法的命令
      const enableCmd = `adb -s ${deviceId} shell ime enable ${imeId}`;
      const stdout = execSync(enableCmd, { encoding: 'utf8' });

      // 解析启用结果
      if (stdout.includes('now enabled for user')) {
        return `✅ ADB Keyboard输入法已成功启用`;
      } else if (stdout.trim() === '') {
        // 部分机型启用成功后无输出，补充判断
        return `✅ ADB Keyboard输入法已成功启用（设备无额外输出）`;
      } else {
        return `⚠️ 输入法启用命令执行完成，输出：${stdout.trim()}`;
      }
    } catch (error) {
      // 处理启用失败的情况
      let errorMsg = '';
      if (error.message.includes('does not exist')) {
        errorMsg = `❌ 输入法${imeId}不存在，启用失败`;
      } else if (error.message.includes('Permission denied')) {
        errorMsg = `❌ 启用输入法权限不足，请开启USB调试（安全设置）`;
      } else {
        errorMsg = `❌ 启用输入法失败：${error.message}`;
      }
      return errorMsg;
    }
  }
}

/**
 * 智能分割stdout，按原文顺序提取系统信息、思考过程、性能指标、执行动作的内容
 * @param {string} stdout - 原始的stdout字符串
 * @returns {Array} 按原文顺序排列的板块对象列表，每个对象包含type（板块类型）和content（内容）
 */
function smartSplitStdoutInOrder(stdout) {
  // 替换换行符，统一为\n，方便处理
  const text = stdout.replace(/\r\n/g, '\n');
  // 定义板块标识与类型的映射：键为板块类型，值为板块的标识字符串
  const sectionFlags = {
    thinkingProcess: '💭 思考过程:',
    performanceMetrics: '⏱️  性能指标:',
    executionAction: '🎯 执行动作:'
  };
  // 存储找到的所有板块（包含位置、类型、内容）
  const foundSections = [];
  // 结束符
  const endSep = '==================================================';

  // ================ 新增步骤1：提取前置的系统信息内容 ================
  // 提取所有板块标识的字符串，用于找到第一个板块的位置
  const allSectionFlagValues = Object.values(sectionFlags);
  // 存储第一个板块标识的位置（初始为文本长度，表示未找到）
  let firstSectionPos = text.length;
  // 遍历所有板块标识，找到第一个出现的位置
  allSectionFlagValues.forEach(flag => {
    const pos = text.indexOf(flag);
    if (pos !== -1 && pos < firstSectionPos) {
      firstSectionPos = pos;
    }
  });
  // 提取前置内容（从文本开头到第一个板块标识的位置）
  const preContent = text.slice(0, firstSectionPos).trim();
  // 如果前置内容不为空，作为“系统信息”板块加入
  if (preContent) {
    foundSections.push({
      pos: 0, // 位置设为0，确保在最前面
      type: 'systemInfo',
      content: preContent // 后续会统一处理转义符
    });
  }
  // ================================================================

  // 遍历每个板块标识，查找所有匹配的位置和内容
  for (const [sectionType, sectionFlag] of Object.entries(sectionFlags)) {
    let startIndex = 0;
    while (true) {
      const flagPos = text.indexOf(sectionFlag, startIndex);
      if (flagPos === -1) {
        break; // 没有更多该板块，退出循环
      }

      // 找到板块的结束位置
      const endPos = text.indexOf(endSep, flagPos + sectionFlag.length);
      let sectionContent = endPos === -1
        ? text.slice(flagPos).trim()
        : text.slice(flagPos, endPos).trim();
      // ================ 新增步骤2：移除转义反斜杠 ================
      sectionContent = sectionContent.replace(/\\/g, ''); // 去掉所有的\转义符
      // =========================================================
      // 记录板块的位置、类型和内容
      foundSections.push({
        pos: flagPos, // 板块在文本中的起始位置，用于排序
        type: sectionType,
        content: sectionContent
      });

      // 更新起始索引，继续查找下一个
      startIndex = endPos === -1 ? text.length : endPos + endSep.length;
    }
  }

  // 按照板块在原文中的起始位置排序，保证顺序和原文一致
  foundSections.sort((a, b) => a.pos - b.pos);

  // 可选：如果需要更友好的类型名称，可以做一层映射（新增systemInfo的映射）
  const typeNameMap = {
    systemInfo: '系统信息', // 新增系统信息的类型名
    thinkingProcess: '思考过程',
    performanceMetrics: '性能指标',
    executionAction: '执行动作'
  };
  const result = foundSections.map(item => ({
    type: typeNameMap[item.type], // 友好的类型名
    rawType: item.type, // 原始类型键（可选保留）
    content: item.content
  }));

  return result;
}

export function apply(ctx: Context, cfg: Config) {
  async function callAutoGLM(msg: string) {
    try {
      const args = [
        '--base-url', cfg['groupRelation'].url,
        '--model', cfg['groupRelation'].model,
        '--apikey', cfg['groupRelation'].apikey,
        msg]
      const res = await runOpenAutoGLM(args, {
        pythonPath: 'python',      // 或 'python3'，或虚拟环境下的完整路径
        timeoutMs: 300_000,        // 5分钟 超时
      })
      // console.log(res)
      return res.stdout
    } catch (err) {
      console.error('call failed:', err)
    }
  }
  ctx.command('操控 <msg>', '调用 AutoGLM 示例命令')
    .action(async ({ session }, msg) => {
      const { selfId, userId } = session;
      // 权限校验：只有主人QQ号有权限
      if (userId.toString() !== cfg['groupRelation'].master) {
        return `❌ 只有主人QQ号 ${cfg['groupRelation'].master} 才有权限使用此命令！`;
      }
      // 发送提示消息（建议await，确保顺序）
      await session.send("好的,请稍等,我要遥控你了!");
      // 调用AutoGLM接口获取结果
      const sections = smartSplitStdoutInOrder(await callAutoGLM(msg));
      // 构建转发消息：循环生成每个板块的<message>节点
      const forwardMessage = h('message',{ forward: true },
        sections.map((section, index) =>
          // 每个循环项生成一个message元素
          h('message',{ key: index },h('author',{id: userId,name: session.username,avatar: `https://q1.qlogo.cn/g?b=qq&nk=${userId}&s=640`}),
            ...section.content.split('\n').flatMap((part, i) =>
              i === 0 ? [part] : [h('br'), part]
            ),
          )
        )
      );
      return forwardMessage;
    });
  ctx.command('检测设备', '检测ADB设备连接状态及ADB Keyboard安装状态')
    .action(async ({ session }) => {
      const result = await checkADBDevices();
      return result
    });
}


