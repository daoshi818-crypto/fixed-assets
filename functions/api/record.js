const APP_ID = "cli_a9744fcb1a391cc8";
const APP_SECRET = "KMBW1e83BhwdYRViYb1e1gDPLA2mHXZ8";

const APP_TOKEN = "NeCRbtLv2a6TfbsD3s1cHq3hncf";
const TABLE_ID = "tblFGeKrKgVPxfAu";

// 获取 tenant token
async function getTenantToken() {
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

  const data = await res.json();
  return data.tenant_access_token;
}

export async function onRequestGet(context) {
  const id = new URL(context.request.url).searchParams.get("id");

  const token = await getTenantToken();

  const res = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${id}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  const data = await res.json();

  return new Response(JSON.stringify(data), {
    headers: {
      "Content-Type": "application/json"
    }
  });
}
