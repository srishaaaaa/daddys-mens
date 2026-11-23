import "server-only";
import { supabaseAdmin as sb } from "@/lib/supabase";

export type Member = {
  id: string;
  memberNo: string;
  name: string;
  phone: string;
  status: "active" | "inactive";
  joinedAt: string;
};

const map = (r: any): Member => ({
  id: r.id,
  memberNo: r.member_no,
  name: r.name,
  phone: r.phone,
  status: r.status === "inactive" ? "inactive" : "active",
  joinedAt: new Date(r.joined_at).toISOString(),
});

const NEEDS_MIGRATION = "Membership isn't set up yet. Run migration 0012 (supabase/all_migrations.sql) in Supabase first.";
const missing = (m: string) => /memberships|membership_seq/.test(m);

export async function listMembers(): Promise<Member[]> {
  const { data, error } = await sb.from("memberships").select("*").order("created_at", { ascending: false }).limit(5000);
  if (error) {
    if (missing(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map(map);
}

/** Registers a customer as a member and gives them the next Membership ID automatically. */
export async function registerMember(rawName: string, rawPhone: string): Promise<Member> {
  const name = String(rawName ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  const phone = String(rawPhone ?? "").replace(/\D/g, "").slice(-10);
  if (!name) throw new Error("Enter the customer's name.");
  if (!/^[6-9]\d{9}$/.test(phone)) throw new Error("Enter a valid 10-digit mobile number.");

  const { data, error } = await sb.from("memberships").insert({ name, phone }).select("*").single();
  if (error) {
    if (missing(error.message)) throw new Error(NEEDS_MIGRATION);
    if (error.code === "23505") {
      // Only now (the rare case) look up who already has this number, for a clear message.
      const { data: ex } = await sb.from("memberships").select("member_no, name").eq("phone", phone).maybeSingle();
      throw new Error(ex ? `This number is already a member (${ex.member_no}, ${ex.name}).` : "This number is already a member.");
    }
    throw new Error(error.message);
  }
  return map(data);
}

export async function setMemberStatus(id: string, active: boolean): Promise<Member> {
  const { data, error } = await sb.from("memberships").update({ status: active ? "active" : "inactive" }).eq("id", id).select("*").single();
  if (error) throw new Error(missing(error.message) ? NEEDS_MIGRATION : error.message);
  return map(data);
}
