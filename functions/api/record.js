const APP_ID = "你的AppID";
const APP_SECRET = "你的AppSecret";

const APP_TOKEN = "NeCRbtLv2a6TfbsD3s1cHq3hncf";
const TABLE_ID = "tblFGeKrKgVPxfAu";


// =====================
// 🔥 获取飞书 token（稳定版）
// =====================
async function getToken() {

  const res = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        app_id: APP_ID,
        app_secret: APP_SECRET
      })
    }
  );

  const text = await res.text();
  const json = JSON.parse(text);

  if (json.code !== 0) {
    throw new Error("token失败：" + text);
  }

  return json.tenant_access_token;
}


// =====================
// 🔥 主接口
// =====================
export async function onRequestGet(context) {

  try {

    const id = new URL(context.request.url).searchParams.get("id");

    if (!id) {
      return jsonError("缺少id参数");
    }

    const token = await getToken();

    const res = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const text = await res.text();
    const json = JSON.parse(text);

    if (json.code !== 0 || !json.data?.record) {
      return jsonError("飞书数据异常", json);
    }

    const f = json.data.record.fields;

    return jsonSuccess({
      资产名称: f["资产名称"] || "-",
      资产编号: f["资产编号"] || "-",
      资产状态: f["资产状态"] || "-",
      购置价格: f["购置价格"] || "-",
      使用部门: f["使用部门"] || "-",
      负责人: f["负责人"]?.[0]?.name || "-"
    });

  } catch (e) {
    return jsonError(e.message);
  }
}


// =====================
// 🔥 工具函数
// =====================
function jsonSuccess(data) {
  return new Response(JSON.stringify({
    code: 0,
    data
  }), {
    headers: { "Content-Type": "application/json" }
  });
}

function jsonError(msg, raw = null) {
  return new Response(JSON.stringify({
    code: 500,
    msg,
    raw
  }), {
    status: 500,
    headers: { "Content-Type": "application/json" }
  });
}
