"use server";

import { requireStaff } from "@/lib/auth";
import { run } from "@/lib/actionResult";
import * as m from "@/lib/membership";

export async function listMembersAction() {
  await requireStaff();
  return m.listMembers();
}
export async function registerMemberAction(name: string, phone: string) {
  await requireStaff();
  return run(() => m.registerMember(name, phone));
}
export async function setMemberStatusAction(id: string, active: boolean) {
  await requireStaff();
  return run(() => m.setMemberStatus(id, active));
}
