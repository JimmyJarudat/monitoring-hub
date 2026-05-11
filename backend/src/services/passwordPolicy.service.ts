import { getSystemConfig, type SecurityConfig } from "./systemConfig.service";

export const getPasswordPolicyMessage = (policy: SecurityConfig): string => {
  const requirements = [`At least ${policy.passwordMinLength} characters`];
  if (policy.requireLowercase) requirements.push("lowercase letters");
  if (policy.requireUppercase) requirements.push("uppercase letters");
  if (policy.requireNumber) requirements.push("numbers");
  if (policy.requireSpecial) requirements.push("special characters");

  return `Password must include: ${requirements.join(", ")}`;
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
