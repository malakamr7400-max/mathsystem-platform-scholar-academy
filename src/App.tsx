import { Suspense, lazy } from 'react'
import {
  createBrowserRouter,
  createRoutesFromElements,
  Navigate,
  Outlet,
  Route,
  RouterProvider,
} from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage'))
const QuestionBankPage = lazy(() => import('./pages/QuestionBankPage'))
const CreateQuestionPage = lazy(() => import('./pages/CreateQuestionPage'))
const EditQuestionPage = lazy(() => import('./pages/EditQuestionPage'))
const AssessmentsPage = lazy(() => import('./pages/AssessmentsPage'))
const CreateAssessmentPage = lazy(() => import('./pages/CreateAssessmentPage'))
const AssessmentDetailPage = lazy(() => import('./pages/AssessmentDetailPage'))
const ModuleQuestionsPage = lazy(() => import('./pages/ModuleQuestionsPage'))
const AssessmentResultsPage = lazy(() => import('./pages/AssessmentResultsPage'))
const AdminAttemptDetailPage = lazy(() => import('./pages/AdminAttemptDetailPage'))
const TaxonomyPage = lazy(() => import('./pages/TaxonomyPage'))
const LevelsCoursesPage = lazy(() => import('./pages/LevelsCoursesPage'))
const OrganizationSettingsPage = lazy(() => import('./pages/OrganizationSettingsPage'))
const StudentAssessmentPage = lazy(() => import('./pages/StudentAssessmentPage'))
const TakeAssessmentPage = lazy(() => import('./pages/TakeAssessmentPage'))
const ReportPage = lazy(() => import('./pages/ReportPage'))
const SurveyActionPlanAdminPage = lazy(() => import('./pages/SurveyActionPlanAdminPage').then(module => ({ default: module.SurveyActionPlanAdminPage })))
const ReportSettingsPage = lazy(() => import('./pages/ReportSettingsPage'))
const ReportStudioPage = lazy(() => import('./pages/ReportStudioPage'))
const EvaluationProfilesPage = lazy(() => import('./pages/EvaluationProfilesPage'))
const ActionPlansPage = lazy(() => import('./pages/ActionPlansPage'))

/** A lightweight accessible placeholder while a route's code downloads. */
function RouteLoading() {
  return (
    <main role="status" aria-live="polite" aria-label="Loading page" className="flex min-h-[55vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <div className="mx-auto mb-4 h-9 w-9 animate-pulse rounded-full bg-blue-100" aria-hidden="true" />
        <p className="text-base font-semibold text-slate-900">Loading your workspace…</p>
      </div>
    </main>
  )
}

function AppProviders() {
  return (
    <AuthProvider>
      <UnsavedChangesProvider>
        <Suspense fallback={<RouteLoading />}>
          <Outlet />
        </Suspense>
      </UnsavedChangesProvider>
    </AuthProvider>
  )
}

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<AppProviders />}>
      {/* Public student flow */}
      <Route path="/assessment/:assessmentId" element={<StudentAssessmentPage />} />
      <Route path="/take/:attemptId" element={<TakeAssessmentPage />} />
      <Route path="/report/:attemptId" element={<ReportRoute />} />

      {/* Auth */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected admin studio */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminDashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/assessments"
        element={
          <ProtectedRoute>
            <AssessmentsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/assessments/new"
        element={
          <ProtectedRoute>
            <CreateAssessmentPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/assessments/:assessmentId"
        element={
          <ProtectedRoute>
            <AssessmentDetailPage />
          </ProtectedRoute>
        }
      />
      {/* Staff-only preview. Reuses the Step 35 no-save trial mode. */}
      <Route
        path="/admin/assessments/:assessmentId/preview"
        element={
          <ProtectedRoute>
            <TakeAssessmentPage preview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/assessments/:assessmentId/modules/:moduleId"
        element={
          <ProtectedRoute>
            <ModuleQuestionsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/assessments/:assessmentId/results"
        element={
          <ProtectedRoute>
            <AssessmentResultsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/attempts/:attemptId"
        element={
          <ProtectedRoute>
            <AdminAttemptDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/questions"
        element={
          <ProtectedRoute>
            <QuestionBankPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/questions/new"
        element={
          <ProtectedRoute>
            <CreateQuestionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/questions/:questionId/edit"
        element={
          <ProtectedRoute>
            <EditQuestionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/taxonomy"
        element={
          <ProtectedRoute>
            <TaxonomyPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/levels"
        element={
          <ProtectedRoute>
            <LevelsCoursesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/evaluation-profiles"
        element={
          <ProtectedRoute>
            <EvaluationProfilesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/action-plans"
        element={
          <ProtectedRoute>
            <ActionPlansPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/survey-action-plans"
        element={
          <ProtectedRoute>
            <SurveyActionPlanAdminPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <ProtectedRoute>
            <OrganizationSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/report-studio"
        element={
          <ProtectedRoute>
            <ReportStudioPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/report-settings"
        element={
          <ProtectedRoute>
            <ReportSettingsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/assessments/:assessmentId/report-settings"
        element={
          <ProtectedRoute>
            <ReportSettingsPage />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to="/admin" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Route>
  )
)

export function App() {
  return <RouterProvider router={router} />
}

function ReportRoute() {
  return <ReportPage />
}

export default App
