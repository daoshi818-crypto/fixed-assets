const APP_ID = "你的AppID";
const APP_SECRET = "你的AppSecret";

const APP_TOKEN = "NeCRbtLv2a6TfbsD3s1cHq3hncf";
const TABLE_ID = "tblFGeKrKgVPxfAu";

async function getToken() {
  const res = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: APP_ID,
        app_secret: APP_SECRET
      })
    }
  );

  const text = await res.text(); // 🔥关键：先看原始返回
  console.log("token raw:", text);

  const data = JSON.parse(text);

  if (!data.tenant_access_token) {
    throw new Error("token获取失败：" + text);
  }

  return data.tenant_access_token;
}

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

    const text = await res.text();
    console.log("feishu raw:", text);

    const json = JSON.parse(text);

    if (json.code !== 0) {
      throw new Error("飞书API失败：" + text);
    }

    const f = json.data.record.fields;

    return new Response(JSON.stringify({
      code: 0,
      data: {
        资产名称: f["资产名称"],
        资产编号: f["资产编号"],
        资产状态: f["资产状态"],
        购置价格: f["购置价格"],
        使用部门: f["使用部门"],
        负责人: f["负责人"]?.[0]?.name || "-"
      }
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({
      error: "后端错误",
      msg: e.message
    }), { status: 500 });
  }
}
