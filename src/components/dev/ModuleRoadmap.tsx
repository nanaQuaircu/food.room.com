import type { DevModule } from '@/lib/module-registry';
import { formatModuleAssignment } from '@/lib/module-registry';

export default function ModuleRoadmap({ module }: { module: DevModule }) {
  return (
    <>
      <div className="row">
        <div className="col-12">
          <div className="mb-6">
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
              <span className="badge text-bg-primary">Team {module.team}</span>
              <span className="badge text-bg-secondary">Loop {module.loop}</span>
              {module.status === 'coming-soon' ? (
                <span className="badge text-bg-warning text-dark">Coming soon</span>
              ) : (
                <span className="badge text-bg-success">Live</span>
              )}
            </div>
            <h1 className="fs-3 mb-1">{module.title}</h1>
            <p className="text-secondary mb-0">{module.summary}</p>
            <p className="small text-muted mb-0 mt-1">Assigned to {formatModuleAssignment(module)}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header bg-white px-4 py-3">
          <h2 className="h6 mb-0">Planned scope</h2>
        </div>
        <div className="card-body p-4">
          <ul className="mb-0">
            {module.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="small text-muted mt-3 mb-0">
        See <code>LOOP_ENGINEERING.md</code> for the full loop engineering plan and team ownership.
      </p>
    </>
  );
}
