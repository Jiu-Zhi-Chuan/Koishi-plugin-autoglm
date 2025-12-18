#!/usr/bin/env python3
"""
手机智能助手命令行工具 - 基于AI的手机自动化操作工具

使用方法:
    python main.py [选项]

环境变量:
    PHONE_AGENT_BASE_URL: 模型API的基础地址（默认值: http://localhost:8000/v1）
    PHONE_AGENT_MODEL: 模型名称（默认值: autoglm-phone-9b）
    PHONE_AGENT_API_KEY: 模型认证的API密钥（默认值: EMPTY）
    PHONE_AGENT_MAX_STEPS: 每个任务的最大执行步骤（默认值: 100）
    PHONE_AGENT_DEVICE_ID: 多设备场景下的ADB设备ID
"""

import argparse
import os
import shutil
import subprocess
import sys
from urllib.parse import urlparse

from openai import OpenAI

from phone_agent import PhoneAgent
from phone_agent.adb import ADBConnection, list_devices
from phone_agent.agent import AgentConfig
from phone_agent.config.apps import list_supported_apps
from phone_agent.model import ModelConfig


def check_system_requirements() -> bool:
    """
    运行代理前检查系统环境要求。

    检查项:
    1. ADB工具是否安装
    2. 至少有一个设备已连接
    3. 设备上是否安装了ADB键盘

    返回:
        所有检查通过返回True，否则返回False。
    """
    print("🔍 正在检查系统环境要求...")
    print("-" * 50)

    all_passed = True

    # 检查项1: ADB是否安装
    print("1. 检查ADB安装情况...", end=" ")
    if shutil.which("adb") is None:
        print("❌ 检查失败")
        print("   错误: ADB未安装或未添加到系统环境变量PATH中。")
        print("   解决方法: 安装Android SDK平台工具:")
        print("     - macOS系统: brew install android-platform-tools")
        print("     - Linux系统: sudo apt install android-tools-adb")
        print(
            "     - Windows系统: 从以下地址下载: https://developer.android.com/studio/releases/platform-tools"
        )
        all_passed = False
    else:
        # 执行adb version命令再次验证
        try:
            result = subprocess.run(
                ["adb", "version"], capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                version_line = result.stdout.strip().split("\n")[0]
                print(f"✅ 正常（{version_line}）")
            else:
                print("❌ 检查失败")
                print("   错误: ADB命令执行失败。")
                all_passed = False
        except FileNotFoundError:
            print("❌ 检查失败")
            print("   错误: 未找到ADB命令。")
            all_passed = False
        except subprocess.TimeoutExpired:
            print("❌ 检查失败")
            print("   错误: ADB命令执行超时。")
            all_passed = False

    # 如果ADB未安装，跳过后续检查
    if not all_passed:
        print("-" * 50)
        print("❌ 系统环境检查失败，请修复上述问题后重试。")
        return False

    # 检查项2: 设备是否已连接
    print("2. 检查已连接的设备...", end=" ")
    try:
        result = subprocess.run(
            ["adb", "devices"], capture_output=True, text=True, timeout=10
        )
        lines = result.stdout.strip().split("\n")
        # 过滤掉标题行和空行，查找状态为'device'的设备
        devices = [line for line in lines[1:] if line.strip() and "\tdevice" in line]

        if not devices:
            print("❌ 检查失败")
            print("   错误: 未检测到已连接的设备。")
            print("   解决方法:")
            print("     1. 在安卓设备上开启USB调试模式")
            print("     2. 通过USB连接设备并授权电脑访问")
            print("     3. 或通过远程连接: python main.py --connect <IP地址>:<端口号>")
            all_passed = False
        else:
            device_ids = [d.split("\t")[0] for d in devices]
            print(f"✅ 正常（检测到{len(devices)}台设备: {', '.join(device_ids)}）")
    except subprocess.TimeoutExpired:
        print("❌ 检查失败")
        print("   错误: ADB命令执行超时。")
        all_passed = False
    except Exception as e:
        print("❌ 检查失败")
        print(f"   错误: {e}")
        all_passed = False

    # 如果未连接设备，跳过ADB键盘检查
    if not all_passed:
        print("-" * 50)
        print("❌ 系统环境检查失败，请修复上述问题后重试。")
        return False

    # 检查项3: ADB键盘是否安装
    print("3. 检查ADB键盘安装情况...", end=" ")
    try:
        result = subprocess.run(
            ["adb", "shell", "ime", "list", "-s"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        ime_list = result.stdout.strip()

        if "com.android.adbkeyboard/.AdbIME" in ime_list:
            print("✅ 正常")
        else:
            print("❌ 检查失败")
            print("   错误: 设备上未安装ADB键盘。")
            print("   解决方法:")
            print("     1. 从以下地址下载ADB键盘APK安装包:")
            print(
                "        https://github.com/senzhk/ADBKeyBoard/blob/master/ADBKeyboard.apk"
            )
            print("     2. 在设备上安装: adb install ADBKeyboard.apk")
            print(
                "     3. 在设备设置中启用: 设置 > 系统 > 语言和输入法 > 虚拟键盘"
            )
            all_passed = False
    except subprocess.TimeoutExpired:
        print("❌ 检查失败")
        print("   错误: ADB命令执行超时。")
        all_passed = False
    except Exception as e:
        print("❌ 检查失败")
        print(f"   错误: {e}")
        all_passed = False

    print("-" * 50)

    if all_passed:
        print("✅ 所有系统环境检查通过！\n")
    else:
        print("❌ 系统环境检查失败，请修复上述问题后重试。")

    return all_passed


def check_model_api(base_url: str, model_name: str, api_key: str = "EMPTY") -> bool:
    """
    检查模型API是否可访问以及指定的模型是否存在。

    检查项:
    1. 与API端点的网络连通性
    2. 指定模型是否在可用模型列表中

    参数:
        base_url: API基础地址
        model_name: 要检查的模型名称
        api_key: 认证用的API密钥

    返回:
        所有检查通过返回True，否则返回False。
    """
    print("🔍 正在检查模型API连接...")
    print("-" * 50)

    all_passed = True

    # 检查项1: 使用聊天API测试网络连通性
    print(f"1. 检查API连通性（{base_url}）...", end=" ")
    try:
        # 创建OpenAI客户端
        client = OpenAI(base_url=base_url, api_key=api_key, timeout=30.0)

        # 使用聊天补全接口测试连通性（比/models接口兼容性更好）
        response = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": "你好"}],
            max_tokens=5,
            temperature=0.0,
            stream=False,
        )

        # 检查是否获取到有效响应
        if response.choices and len(response.choices) > 0:
            print("✅ 正常")
        else:
            print("❌ 检查失败")
            print("   错误: 从API接收到空响应")
            all_passed = False

    except Exception as e:
        print("❌ 检查失败")
        error_msg = str(e)

        # 提供更具体的错误提示
        if "Connection refused" in error_msg or "Connection error" in error_msg:
            print(f"   错误: 无法连接到 {base_url}")
            print("   解决方法:")
            print("     1. 检查模型服务是否正在运行")
            print("     2. 验证API基础地址是否正确")
            print(f"     3. 尝试执行: curl {base_url}/chat/completions")
        elif "timed out" in error_msg.lower() or "timeout" in error_msg.lower():
            print(f"   错误: 连接 {base_url} 超时")
            print("   解决方法:")
            print("     1. 检查网络连接是否正常")
            print("     2. 验证服务端是否正常响应")
        elif (
            "Name or service not known" in error_msg
            or "nodename nor servname" in error_msg
        ):
            print(f"   错误: 无法解析域名")
            print("   解决方法:")
            print("     1. 检查URL地址是否正确")
            print("     2. 验证DNS设置是否正常")
        else:
            print(f"   错误: {error_msg}")

        all_passed = False

    print("-" * 50)

    if all_passed:
        print("✅ 模型API检查通过！\n")
    else:
        print("❌ 模型API检查失败，请修复上述问题后重试。")

    return all_passed


def parse_args() -> argparse.Namespace:
    """解析命令行参数。"""
    parser = argparse.ArgumentParser(
        description="手机智能助手 - 基于AI的手机自动化操作工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用示例:
    # 使用默认设置运行
    python main.py

    # 指定模型服务地址
    python main.py --base-url http://localhost:8000/v1

    # 使用API密钥进行认证
    python main.py --apikey sk-xxxxx

    # 指定设备运行
    python main.py --device-id emulator-5554

    # 连接远程设备
    python main.py --connect 192.168.1.100:5555

    # 列出已连接的设备
    python main.py --list-devices

    # 在USB连接的设备上启用TCP/IP并获取连接信息
    python main.py --enable-tcpip

    # 列出支持的应用
    python main.py --list-apps
        """,
    )

    # 模型相关选项
    parser.add_argument(
        "--base-url",
        type=str,
        default=os.getenv("PHONE_AGENT_BASE_URL", "http://localhost:8000/v1"),
        help="模型API的基础地址",
    )

    parser.add_argument(
        "--model",
        type=str,
        default=os.getenv("PHONE_AGENT_MODEL", "autoglm-phone-9b"),
        help="模型名称",
    )

    parser.add_argument(
        "--apikey",
        type=str,
        default=os.getenv("PHONE_AGENT_API_KEY", "EMPTY"),
        help="模型认证的API密钥",
    )

    parser.add_argument(
        "--max-steps",
        type=int,
        default=int(os.getenv("PHONE_AGENT_MAX_STEPS", "100")),
        help="每个任务的最大执行步骤",
    )

    # 设备相关选项
    parser.add_argument(
        "--device-id",
        "-d",
        type=str,
        default=os.getenv("PHONE_AGENT_DEVICE_ID"),
        help="ADB设备ID",
    )

    parser.add_argument(
        "--connect",
        "-c",
        type=str,
        metavar="地址",
        help="连接远程设备（例如: 192.168.1.100:5555）",
    )

    parser.add_argument(
        "--disconnect",
        type=str,
        nargs="?",
        const="all",
        metavar="地址",
        help="断开远程设备连接（或使用'all'断开所有连接）",
    )

    parser.add_argument(
        "--list-devices", action="store_true", help="列出已连接的设备并退出"
    )

    parser.add_argument(
        "--enable-tcpip",
        type=int,
        nargs="?",
        const=5555,
        metavar="端口号",
        help="在USB连接的设备上启用TCP/IP调试（默认端口: 5555）",
    )

    # 其他选项
    parser.add_argument(
        "--quiet", "-q", action="store_true", help="关闭详细输出信息"
    )

    parser.add_argument(
        "--list-apps", action="store_true", help="列出支持的应用并退出"
    )

    parser.add_argument(
        "--lang",
        type=str,
        choices=["cn", "en"],
        default=os.getenv("PHONE_AGENT_LANG", "cn"),
        help="系统提示词的语言（cn为中文，en为英文，默认: cn）",
    )

    parser.add_argument(
        "task",
        nargs="?",
        type=str,
        help="要执行的任务（未提供则进入交互模式）",
    )

    return parser.parse_args()


def handle_device_commands(args) -> bool:
    """
    处理设备相关的命令。

    返回:
        如果处理了设备命令（应退出程序）返回True，否则返回False。
    """
    conn = ADBConnection()

    # 处理--list-devices命令
    if args.list_devices:
        devices = list_devices()
        if not devices:
            print("未检测到已连接的设备。")
        else:
            print("已连接的设备:")
            print("-" * 60)
            for device in devices:
                status_icon = "✓" if device.status == "device" else "✗"
                conn_type = device.connection_type.value
                model_info = f"（{device.model}）" if device.model else ""
                print(
                    f"  {status_icon} {device.device_id:<30} [{conn_type}]{model_info}"
                )
        return True

    # 处理--connect命令
    if args.connect:
        print(f"正在连接 {args.connect}...")
        success, message = conn.connect(args.connect)
        print(f"{'✓' if success else '✗'} {message}")
        if success:
            # 设置为默认设备
            args.device_id = args.connect
        return not success  # 连接成功则继续执行，否则退出

    # 处理--disconnect命令
    if args.disconnect:
        if args.disconnect == "all":
            print("正在断开所有远程设备连接...")
            success, message = conn.disconnect()
        else:
            print(f"正在断开与 {args.disconnect} 的连接...")
            success, message = conn.disconnect(args.disconnect)
        print(f"{'✓' if success else '✗'} {message}")
        return True

    # 处理--enable-tcpip命令
    if args.enable_tcpip:
        port = args.enable_tcpip
        print(f"正在端口 {port} 上启用TCP/IP调试...")

        success, message = conn.enable_tcpip(port, args.device_id)
        print(f"{'✓' if success else '✗'} {message}")

        if success:
            # 尝试获取设备IP地址
            ip = conn.get_device_ip(args.device_id)
            if ip:
                print(f"\n现在可以通过以下方式远程连接:")
                print(f"  python main.py --connect {ip}:{port}")
                print(f"\n或直接使用ADB命令:")
                print(f"  adb connect {ip}:{port}")
            else:
                print("\n无法获取设备IP地址，请查看设备的WiFi设置。")
        return True

    return False


def main():
    """主程序入口。"""
    args = parse_args()

    # 处理--list-apps命令（无需系统检查）
    if args.list_apps:
        print("支持的应用:")
        for app in sorted(list_supported_apps()):
            print(f"  - {app}")
        return

    # 处理设备相关命令（可能需要部分系统检查）
    if handle_device_commands(args):
        return

    # 执行系统环境要求检查
    if not check_system_requirements():
        sys.exit(1)

    # 检查模型API连通性和模型可用性
    if not check_model_api(args.base_url, args.model, args.apikey):
        sys.exit(1)

    # 创建配置对象
    model_config = ModelConfig(
        base_url=args.base_url,
        model_name=args.model,
        api_key=args.apikey,
        lang=args.lang,
    )

    agent_config = AgentConfig(
        max_steps=args.max_steps,
        device_id=args.device_id,
        verbose=not args.quiet,
        lang=args.lang,
    )

    # 创建智能助手实例
    agent = PhoneAgent(
        model_config=model_config,
        agent_config=agent_config,
    )

    # 打印头部信息
    print("=" * 50)
    print("手机智能助手 - 基于AI的手机自动化操作工具")
    print("=" * 50)
    print(f"模型: {model_config.model_name}")
    print(f"基础地址: {model_config.base_url}")
    print(f"最大步骤: {agent_config.max_steps}")
    print(f"语言: {agent_config.lang}")

    # 显示设备信息
    devices = list_devices()
    if agent_config.device_id:
        print(f"设备: {agent_config.device_id}")
    elif devices:
        print(f"设备: {devices[0].device_id}（自动检测）")

    print("=" * 50)

    # 执行指定任务或进入交互模式
    if args.task:
        print(f"\n任务: {args.task}\n")
        result = agent.run(args.task)
        print(f"\n结果: {result}")
    else:
        # 交互模式
        print("\n进入交互模式，输入'quit'退出程序。\n")

        while True:
            try:
                task = input("请输入你的任务: ").strip()

                if task.lower() in ("quit", "exit", "q"):
                    print("再见！")
                    break

                if not task:
                    continue

                print()
                result = agent.run(task)
                print(f"\n结果: {result}\n")
                agent.reset()

            except KeyboardInterrupt:
                print("\n\n程序被中断，再见！")
                break
            except Exception as e:
                print(f"\n错误: {e}\n")


if __name__ == "__main__":
    main()