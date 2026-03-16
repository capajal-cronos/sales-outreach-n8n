# n8n Workflow Manager - Feature Overview

## 🎯 Complete Workflow Pipeline

Your frontend application provides a complete 5-stage workflow for lead generation and outreach:

```
Apollo.io → Pipedrive → Email Automation → Response Tracking
```

## 📋 Detailed Features by Stage

### Stage 1: Organization Search 🏢

**Apollo.io Integration Ready**
- Company name and domain search
- Employee count filtering (8 predefined ranges)
- Revenue range selection (7 ranges from $0-$1M to $1B+)
- Location-based filtering
- Industry tag filtering
- Visual card-based results display
- Remove unwanted organizations before saving
- Batch save to Pipedrive

**Apollo.io Parameters Supported:**
- `organizationName`
- `organizationDomain`
- `organizationNumEmployeesRanges`
- `organizationLocations`
- `organizationIndustryTagIds`
- `revenueRange`

### Stage 2: People Finder 👥

**Contact Discovery**
- Select multiple organizations from Stage 1
- Job title filtering
- Seniority level selection (8 levels: Entry to Owner)
- Department filtering (10 departments)
- Location filtering
- Comprehensive contact information display
- LinkedIn profile links
- Email and phone details
- Batch save to Pipedrive

**Search Capabilities:**
- Select all/deselect all organizations
- Multi-criteria filtering
- Table view with sortable columns
- Individual contact removal

### Stage 3: Lead Management 📊

**Pipedrive Integration**
- Automatic lead creation from contacts
- Lead status tracking (7 statuses: new → won/lost)
- Pipeline value calculation
- Expected close date tracking
- Notes and comments per lead
- Lead statistics dashboard
- Status-based filtering
- Individual lead management

**Lead Statuses:**
- New
- Contacted
- Qualified
- Proposal
- Negotiation
- Won
- Lost

**Statistics Tracked:**
- Total leads
- Leads by status
- Total pipeline value
- Conversion metrics

### Stage 4: Email Campaign 📧

**Campaign Management**
- Pre-built email templates (3 templates)
- Custom email composition
- Variable substitution (firstName, lastName, title, organization)
- Email preview with real data
- Recipient selection from leads
- Send immediately or schedule
- Automatic follow-up configuration
- Campaign history tracking

**Email Templates:**
1. Cold Outreach
2. Follow-up
3. Value Proposition

**Campaign Metrics:**
- Emails sent
- Open tracking
- Click tracking
- Reply tracking

### Stage 5: Response Monitor 📈

**Engagement Analytics**
- Real-time response tracking
- Email open rate calculation
- Click-through rate tracking
- Reply rate monitoring
- Sentiment analysis (positive/neutral/negative)
- Campaign performance comparison
- Activity filtering (all/opens/clicks/replies)
- Response timeline
- Action buttons for replies

**Dashboard Metrics:**
- Total emails sent
- Open rate percentage
- Click rate percentage
- Reply rate percentage
- Positive reply count
- Per-campaign breakdown

## 🎨 User Experience Features

### Visual Design
- Modern, professional dark/light theme
- Responsive layout (desktop, tablet, mobile)
- Smooth animations and transitions
- Color-coded status indicators
- Interactive hover effects
- Card-based layouts
- Progress indicators

### Navigation
- 5-step workflow progress bar
- Click-to-navigate between stages
- Visual completion indicators
- Item count per stage
- Previous/Next navigation buttons

### Data Management
- Automatic localStorage persistence
- Session recovery
- Data validation
- Error handling
- Loading states
- Success/error notifications

## 🔗 n8n Integration Points

### Webhook Endpoints (Ready to Configure)

1. **Organization Search**
   - `POST /webhook/apollo-search`
   - Accepts search parameters
   - Returns organization array

2. **People Search**
   - `POST /webhook/apollo-people-search`
   - Accepts organization IDs and filters
   - Returns contact array

3. **Lead Creation**
   - `POST /webhook/pipedrive-create-leads`
   - Accepts people data
   - Creates leads in Pipedrive

4. **Email Campaign**
   - `POST /webhook/send-email-campaign`
   - Accepts campaign configuration
   - Sends emails to selected leads

5. **Response Tracking**
   - `POST /webhook/track-email-opens`
   - `POST /webhook/track-email-clicks`
   - `POST /webhook/process-email-replies`
   - Captures engagement events

## 💾 Data Persistence

**LocalStorage Keys:**
- `n8n-workflow-data` - All workflow data
- `n8n-current-step` - Current workflow stage

**Data Structure:**
```javascript
{
  organizations: [...],
  people: [...],
  leads: [...],
  campaigns: [...],
  responses: [...]
}
```

## 🚀 Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Access Application**
   - Open http://localhost:3000

4. **Follow Workflow**
   - Start with Organization Search
   - Progress through each stage
   - Data persists automatically

5. **Configure n8n Webhooks** (Optional)
   - See README.md for webhook setup
   - Update endpoint URLs in components
   - Test with real data

## 📱 Browser Compatibility

- ✅ Chrome/Edge (Recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Opera

## 🔒 Security Notes

- Frontend-only application (no backend)
- No API keys stored in code
- LocalStorage for data persistence
- Ready for backend integration
- CORS configuration needed for webhooks

## 🎓 Learning Resources

- [Apollo.io API Documentation](https://apolloio.github.io/apollo-api-docs/)
- [Pipedrive API Documentation](https://developers.pipedrive.com/docs/api/v1)
- [n8n Documentation](https://docs.n8n.io/)
- [React Documentation](https://react.dev/)

## 🤝 Support

For questions or issues:
1. Check START.md for quick start help
2. Review README.md for detailed documentation
3. Inspect browser console for errors
4. Verify n8n webhook configuration

---

**Built for efficient lead generation and outreach automation** 🎯