import { getSystemConfig, type SecurityConfig } from "./systemConfig.service";

export const getPasswordPolicyMessage = (policy: SecurityConfig): string => {
  const requirements = [`อย่างน้อย ${policy.passwordMinLength} ตัวอักษร`];
  if (policy.requireLowercase) requirements.push("มีตัวพิมพ์เล็ก");
  if (policy.requireUppercase) requirements.push("มีตัวพิมพ์ใหญ่");
  if (policy.requireNumber) requirements.push("มีตัวเลข");
  if (policy.requireSpecial) requirements.push("มีอักขระพิเศษ");

  return `รหัสผ่านต้อง${requirements.join(", ")}`;
};

export const validatePasswordPolicy = async (password: string): Promise<string | null> => {
  const { security } = await getSystemConfig();

  if (password.length < security.passwordMinLength) return getPasswordPolicyMessage(security);
  if (security.requireLowercase && !/[a-z]/.test(password)) return getPasswordPolicyMessage(security);
  if (security.requireUppercase && !/[A-Z]/.test(password)) return getPasswordPolicyMessage(security);
  if (security.requireNumber && !/[0-9]/.test(password)) return getPasswordPolicyMessage(security);
  if (security.requireSpecial && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)) {
    return getPasswordPolicyMessage(security);
  }

  return null;
};
