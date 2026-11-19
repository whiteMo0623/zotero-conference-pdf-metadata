# Zotero 会议论文自动识别

[English](README.en.md)

给 Zotero 10 桌面版使用的插件。把会议论文 PDF 导入个人文库时，它会在 Zotero 自带的识别流程中查询 Crossref 和 DBLP，并在匹配成功后将父条目整理为「会议论文」，填写会议简称和年份。

## 安装与使用

1. 在仓库的 **Releases** 下载 `zotero-conference-pdf-metadata.xpi`，或按下文从源码构建。
2. 打开 Zotero 的 **工具 → 插件**，点击齿轮，选择 **从文件安装插件**，选中下载的 `.xpi`。
3. 在 Zotero 设置中启用自动检索 PDF 元数据，再将 PDF 拖入个人文库的条目列表。请将文件添加为独立附件，以触发自动识别。
4. 识别完成后查看 PDF 的父条目。匹配成功时，条目类型为「会议论文」，会议名称和论文集标题会显示会议简称，例如 `ICLR`，日期会补上会议年份。

插件声明兼容 **Zotero 10.0.x**，并依赖 Zotero 内部的文件识别接口。首次安装请从 Releases 下载 XPI，后续版本可由 Zotero 的插件管理器检查更新。

## 匹配范围

- 插件处理自动识别流程中个人文库里的新导入、由 Zotero 保存的顶层 PDF。链接文件、群组文库、已有父条目的附件和手动发起的识别都在处理范围之外。
- 插件优先用可用的 DOI 查询 Crossref，再按标题查询 Crossref 会议论文记录，必要时回退到 DBLP。候选须匹配标题和第一作者，同次查询中匹配到的会议简称与年份须一致。
- 查询无结果、查到明确的期刊 DOI 或发现可识别的版本冲突时，沿用 Zotero 原识别结果。覆盖率取决于数据库收录、PDF 文本质量及元数据一致性。
- 内置常见 AI 和计算机科学会议的别名，例如 NeurIPS、ICLR、ICML、AAAI、CVPR、ICCV、ECCV、ACL、EMNLP 和 KDD。数据库提供合适的会议简称时，也可匹配其他会议。

## 数据与隐私

插件的补充查询可能将 DOI 或论文标题发送给 Crossref，并将论文标题和已有的第一作者姓名发送给 DBLP。插件的补充查询只传输用于匹配的元数据。Zotero 自带的识别流程也会照常运行，并可能向 Zotero 的识别服务发送提取的 PDF 数据与文件名。相关服务见 [Crossref REST API](https://www.crossref.org/documentation/retrieve-metadata/rest-api/)、[DBLP SPARQL 服务](https://blog.dblp.org/2024/09/09/introducing-our-public-sparql-query-service/) 和 [Zotero 识别实现](https://github.com/zotero/zotero/blob/main/chrome/content/zotero/xpcom/recognizeDocument.js)。

## 从源码构建

在仓库根目录用 Python 3 构建，脚本只使用标准库。Windows 上可用 `py -3` 替代 `python3`。

```sh
python3 scripts/build.py
```

安装包生成在 `dist/zotero-conference-pdf-metadata.xpi`。GitHub Actions 会检查脚本语法、清单 JSON 和 XPI 打包。维护者发布版本时，使用与 `manifest.json` 版本号一致的标签（如 `v1.0.3`），将生成的 XPI 附到对应的 GitHub Release，并在 [更新清单](updates.json) 中登记版本、下载地址、SHA-256 和兼容范围。

欢迎提交 Issue 或 PR。反馈识别问题时，请提供 Zotero 与插件版本、复现步骤、预期与实际的条目类型和会议字段，以及可公开的 DOI 或论文链接（如有）。

本项目采用 [MIT 许可证](LICENSE)。
