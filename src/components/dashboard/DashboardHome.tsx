import Link from 'next/link';
import DashboardCharts from '@/components/dashboard/DashboardCharts';
import { getTenantModule } from '@/lib/module-registry';

const dashboardModule = getTenantModule('dashboard');

const topRoomTypes = [
  { image: '/assets/images/product-2.png', name: 'Deluxe King', rate: 'GHS 450', units: '86% occupancy', badge: 'danger', badgeText: '18%' },
  { image: '/assets/images/product-1.png', name: 'Standard Twin', rate: 'GHS 280', units: '72% occupancy', badge: 'primary', badgeText: '32%' },
  { image: '/assets/images/product-3.png', name: 'Executive Suite', rate: 'GHS 890', units: '64% occupancy', badge: 'info', badgeText: '22%' },
  { image: '/assets/images/product-4.png', name: 'Family Room', rate: 'GHS 520', units: '58% occupancy', badge: 'success', badgeText: '28%' },
  { image: '/assets/images/product-5.png', name: 'Penthouse', rate: 'GHS 1,200', units: '41% occupancy', badge: 'warning', badgeText: '25%' },
];

const roomsNeedingAttention = [
  { image: '/assets/images/product-8.png', name: 'Room 101', id: 'Dirty', stock: '06', label: 'Pending' },
  { image: '/assets/images/product-4.png', name: 'Room 208', id: 'Inspect', stock: '09', label: 'Pending' },
  { image: '/assets/images/product-10.png', name: 'Room 315', id: 'Maintenance', stock: '03', label: 'Open' },
  { image: '/assets/images/product-4.png', name: 'Room 402', id: 'Dirty', stock: '07', label: 'Pending' },
  { image: '/assets/images/product-6.png', name: 'Room 512', id: 'Out of Order', stock: '02', label: 'Blocked' },
];

const recentReservations = [
  { image: '/assets/images/product-7.png', name: 'Kwame Asante', meta: 'Deluxe King', price: 'GHS 2,499', status: 'success', statusText: 'Checked In' },
  { image: '/assets/images/product-9.png', name: 'Ama Boateng', meta: 'Standard Twin', price: 'GHS 549', status: 'primary', statusText: 'Confirmed' },
  { image: '/assets/images/product-8.png', name: 'John Smith', meta: 'Executive Suite', price: 'GHS 799', status: 'success', statusText: 'Checked Out' },
  { image: '/assets/images/product-3.png', name: 'Sarah Mensah', meta: 'Family Room', price: 'GHS 799', status: 'warning', statusText: 'Pending' },
  { image: '/assets/images/product-6.png', name: 'David Osei', meta: 'Penthouse', price: 'GHS 299', status: 'danger', statusText: 'Cancelled' },
];

export default function DashboardHome() {
  return (
    <>
      <div className="row">
        <div className="col-12">
          <div className="mb-6">
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
              {dashboardModule ? (
                <>
                  <span className="badge text-bg-primary">Team {dashboardModule.team}</span>
                  <span className="badge text-bg-secondary">Loop {dashboardModule.loop}</span>
                </>
              ) : null}
            </div>
            <h1 className="fs-3 mb-1">Dashboard</h1>
            <p className="text-secondary mb-0">
              {dashboardModule?.summary || 'Hotel operations overview for today.'}
            </p>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-lg-3 col-12">
          <div className="card p-4 bg-primary bg-opacity-10 border border-primary border-opacity-25 rounded-2">
            <div className="d-flex gap-3">
              <div className="icon-shape icon-md bg-primary text-white rounded-2">
                <i className="ti ti-report-analytics fs-4" />
              </div>
              <div>
                <h2 className="mb-3 fs-6">Room Revenue</h2>
                <h3 className="fw-bold mb-0">GHS 25,000</h3>
                <p className="text-primary mb-0 small">+5% since last month</p>
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-3 col-12">
          <div className="card p-4 bg-success bg-opacity-10 border border-success border-opacity-25 rounded-2">
            <div className="d-flex gap-3">
              <div className="icon-shape icon-md bg-success text-white rounded-2">
                <i className="ti ti-repeat fs-4" />
              </div>
              <div>
                <h2 className="mb-3 fs-6">Total Bookings</h2>
                <h3 className="fw-bold mb-0">186</h3>
                <p className="text-success mb-0 small">+22% since last month</p>
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-3 col-12">
          <div className="card p-4 bg-info bg-opacity-10 border border-info border-opacity-25 rounded-2">
            <div className="d-flex gap-3">
              <div className="icon-shape icon-md bg-info text-white rounded-2">
                <i className="ti ti-currency-dollar fs-4" />
              </div>
              <div>
                <h2 className="mb-3 fs-6">Operating Costs</h2>
                <h3 className="fw-bold mb-0">GHS 9,000</h3>
                <p className="text-info mb-0 small">+10% since last month</p>
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-3 col-12">
          <div className="card p-4 bg-warning bg-opacity-10 border border-warning border-opacity-25 rounded-2">
            <div className="d-flex gap-3">
              <div className="icon-shape icon-md bg-warning text-white rounded-2">
                <i className="ti ti-notes fs-4" />
              </div>
              <div>
                <h2 className="mb-3 fs-6">Outstanding Folios</h2>
                <h3 className="fw-bold mb-0">GHS 4,250</h3>
                <p className="text-warning mb-0 small">12 open folios</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-lg-4 col-12">
          <div className="card">
            <div className="card-body p-4">
              <div className="d-flex justify-content-between border-bottom pb-5 mb-3">
                <div>
                  <h3 className="fw-bold h4">GHS 25,458</h3>
                  <span>Net Revenue</span>
                </div>
                <div>
                  <i className="ti ti-layers-subtract fs-1 text-primary" />
                </div>
              </div>
              <div className="d-flex justify-content-between align-items-center small">
                <div className="text-muted">
                  <span className="text-success">+35%</span> vs Last Month
                </div>
                <div>
                  <a href="/reports" className="link-primary text-decoration-underline">
                    View
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-4 col-12">
          <div className="card">
            <div className="card-body p-4">
              <div className="d-flex justify-content-between border-bottom pb-5 mb-3">
                <div>
                  <h3 className="fw-bold h4">GHS 3,120</h3>
                  <span>Refunds</span>
                </div>
                <div>
                  <i className="ti ti-credit-card fs-1 text-danger" />
                </div>
              </div>
              <div className="d-flex justify-content-between align-items-center small">
                <div className="text-muted">
                  <span className="text-danger">-20%</span> vs Last Month
                </div>
                <div>
                  <a href="/billing" className="link-primary text-decoration-underline">
                    View
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-4 col-12">
          <div className="card">
            <div className="card-body p-4">
              <div className="d-flex justify-content-between border-bottom pb-5 mb-3">
                <div>
                  <h3 className="fw-bold h4">78%</h3>
                  <span>Occupancy Rate</span>
                </div>
                <div>
                  <i className="ti ti-cash-banknote fs-1 text-warning" />
                </div>
              </div>
              <div className="d-flex justify-content-between align-items-center small">
                <div className="text-muted">
                  <span className="text-warning">+8%</span> vs Last Month
                </div>
                <div>
                  <a href="/rooms" className="link-primary text-decoration-underline">
                    View
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DashboardCharts />

      <div className="row g-3">
        <div className="col-lg-4">
          <div className="card h-100">
            <div className="card-header bg-white d-flex justify-content-between align-items-center px-4 py-3">
              <h4 className="mb-0 h5">Top Room Types</h4>
              <button type="button" className="btn btn-sm btn-outline-secondary">
                <i className="ti ti-calendar" /> Today
              </button>
            </div>
            <ul className="list-group list-group-flush">
              {topRoomTypes.map((item) => (
                <li key={item.name} className="list-group-item d-flex align-items-center gap-3">
                  <img src={item.image} alt="" className="rounded" width={48} height={48} />
                  <div className="flex-grow-1">
                    <p className="mb-1">{item.name}</p>
                    <div className="d-flex align-items-center gap-2 text-muted">
                      <small className="fw-semibold">{item.rate}</small>
                      <small>•</small>
                      <small>{item.units}</small>
                    </div>
                  </div>
                  <span className={`badge bg-${item.badge}-subtle text-${item.badge} border border-${item.badge}`}>
                    {item.badgeText}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card h-100">
            <div className="card-header bg-white d-flex justify-content-between align-items-center px-4 py-3">
              <h4 className="mb-0 h5">Rooms Needing Attention</h4>
              <Link href="/housekeeping" className="small text-primary text-decoration-underline">
                View All
              </Link>
            </div>
            <ul className="list-group list-group-flush">
              {roomsNeedingAttention.map((item) => (
                <li key={item.name} className="list-group-item d-flex align-items-center gap-3">
                  <img src={item.image} alt="" className="rounded" width={48} height={48} />
                  <div className="flex-grow-1">
                    <p className="mb-1">{item.name}</p>
                    <small>{item.id}</small>
                  </div>
                  <div className="d-flex flex-column gap-0 align-items-center">
                    <span className="fw-semibold text-primary">{item.stock}</span>
                    <small className="text-muted">{item.label}</small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card h-100">
            <div className="card-header bg-white d-flex justify-content-between align-items-center px-4 py-3">
              <h4 className="mb-0 h5">Recent Reservations</h4>
              <button type="button" className="btn btn-sm btn-outline-secondary">
                <i className="ti ti-calendar-event" /> Weekly
              </button>
            </div>
            <ul className="list-group list-group-flush">
              {recentReservations.map((item) => (
                <li key={item.name} className="list-group-item d-flex align-items-center gap-3">
                  <img src={item.image} alt="" className="rounded" width={48} height={48} />
                  <div className="flex-grow-1">
                    <p className="mb-1">{item.name}</p>
                    <div className="d-flex align-items-center gap-2 text-muted">
                      <small className="fw-semibold">{item.meta}</small>
                      <small>•</small>
                      <small>{item.price}</small>
                    </div>
                  </div>
                  <span className={`badge bg-${item.status}-subtle text-${item.status}`}>{item.statusText}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-12">
          <footer className="text-center py-2 mt-6 text-secondary">
            <p className="mb-0">
              Copyright © 2026 Hotel PMS Pro. UI by{' '}
              <a href="https://codescandy.com/" target="_blank" rel="noreferrer" className="text-primary">
                CodesCandy
              </a>{' '}
              • Distributed by{' '}
              <a href="https://themewagon.com/" target="_blank" rel="noreferrer" className="text-primary">
                ThemeWagon
              </a>
            </p>
          </footer>
        </div>
      </div>
    </>
  );
}
