export function SecurityPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Security</h1>
      <p className="text-slate-500">
        Users, roles, and MFA management.
      </p>

      <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
        <div className="text-3xl">🔒</div>
        <h2 className="mt-3 font-semibold text-slate-800">Coming soon</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Authentication, role-based permissions and MFA are not implemented yet.
          The console and API are currently open within the developer-01
          environment.
        </p>
      </div>
    </div>
  );
}
