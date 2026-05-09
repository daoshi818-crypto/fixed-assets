const APP_ID = "你的AppID";
const APP_SECRET = "你的AppSecret";

const APP_TOKEN = "NeCRbtLv2a6TfbsD3s1cHq3hncf";
const TABLE_ID = "tblFGeKrKgVPxfAu";


// 🔥 关键：必须存在这个函数
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

  const json = await res.json();

  if (!json.tenant_access_token) {
    throw new Error("token获取失败：" + JSON.stringify(json));
  }

  return json.tenant_access_token;
}


// ✅ 主接口
export async function onRequestGet(context) {

  try {

    const id = new URL(context.request.url).searchParams.get("id");

    const token = await getToken();

    const res = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const json = await res.json();

    if (!json.data || !json.data.record) {
      return new Response(JSON.stringify({
        code: 1,
        msg: "飞书返回异常",
        raw: json
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const f = json.data.record.fields;

    return new Response(JSON.stringify({
      code: 0,
      data: {
        资产名称: f["资产名称"] || "-",
        资产编号: f["资产编号"] || "-",
        资产状态: f["资产状态"] || "-",
        购置价格: f["购置价格"] || "-",
        使用部门: f["使用部门"] || "-",
        负责人: f["负责人"]?.[0]?.name || "-"
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {

    return new Response(JSON.stringify({
      code: 500,
      msg: e.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
