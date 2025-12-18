# <center>万物皆可Bot - AutoGLM 控制手机！</center>

### 更新进度
- 12.16-2025 - 初版发布 目前支持有线ADB连接手机并安装ADB Keyboard应用

## 插件起源
- 事情还要从某天说起，那天我闲着无聊打开了B站就看到了一个视频，视频如下，我在想都可以写成这样了，为什么不让Bot来帮我操控手机呢？于是就有了这个插件的诞生。我的文档看你写出来教程不是很明细，你们需要也可以看看下面的视频[自语：虽然也不知道能干啥用吧，但是写出来总归是好事情嘛~]

### 项目所需文件
- 下载链接：https://wwant.lanzouu.com/b0187zv6kf [密码:4i7r] 含requirements.txt和所有必要文件

> ps: 以下是抄源代码的文档的，我是新手小白有些东西可能不太懂还请大佬多多指教[鞠躬]

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

MIT License © 2025
